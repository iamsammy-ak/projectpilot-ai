import type { Charter, GeneratorInput, PlanSource, Priority, Project, Resource, Risk, Task } from '../types'
import { COMPLEXITY_LABEL, PROJECT_TYPE_LABEL } from '../types'
import { fmtLong, fromWIdx, snapToWorkday, wIdx, wIdxFloor } from '../lib/dates'
import { clamp, firstSentence, fmtMoney, PROJECT_COLORS, uid } from '../lib/format'
import { analyze, autoSchedule } from '../lib/schedule'
import { TEMPLATES, type TaskT } from './templates'

/**
 * A plan before it is scheduled: structure, estimates and text, but no dates.
 * Both the built-in engine and the Claude integration produce this shape, and `buildProject`
 * turns it into a scheduled project — so dates and dependencies are always computed locally.
 */
export interface OutlineTask {
  ref: string
  name: string
  description: string
  days: number
  role: string
  dependsOn: string[]
  milestone: boolean
}
export interface OutlineRisk {
  description: string
  category: string
  probability: number
  impact: number
  mitigation: string
  ownerRole: string
}
export interface PlanOutline {
  charter: Charter
  phases: { name: string; tasks: OutlineTask[] }[]
  risks: OutlineRisk[]
}

const LEVEL = { simple: 1, medium: 2, complex: 3 } as const
const EFFORT = { simple: 0.8, medium: 1, complex: 1.25 } as const

/** Deterministic outline from the template library — no network involved. */
export function engineOutline(input: GeneratorInput): PlanOutline {
  const tpl = TEMPLATES[input.type]
  const level = LEVEL[input.complexity]
  const effort = EFFORT[input.complexity]
  const gateRef = (p: number) => `p${p}.gate`

  const phases = tpl.phases.map((ph, p) => {
    const included = ph.tasks.map((t) => (t[4] ?? 1) <= level)
    const entry = (ph.after ?? (p > 0 ? [p - 1] : [])).map(gateRef)
    const ref = (i: number) => `p${p}.t${i}`

    // Resolve a dependency on a task that this complexity level leaves out to that task's own dependencies.
    const resolve = (i: number): string[] => {
      if (included[i]) return [ref(i)]
      return depsOf(i).flatMap(resolve)
    }
    const depsOf = (i: number): number[] => {
      const d = (ph.tasks[i] as TaskT)[3]
      if (d) return d
      return i > 0 ? [i - 1] : []
    }

    const hasSuccessor = new Set<string>()
    const tasks: OutlineTask[] = []
    ph.tasks.forEach((t, i) => {
      if (!included[i]) return
      const [name, days, role] = t
      let deps = [...new Set(depsOf(i).flatMap(resolve))]
      deps.forEach((d) => hasSuccessor.add(d))
      if (!deps.length) deps = entry
      tasks.push({
        ref: ref(i),
        name,
        description: `${name} as part of ${ph.name}. Feeds the "${ph.gate}" milestone.`,
        days: Math.max(1, Math.round(days * effort)),
        role: tpl.roles[role] ?? role,
        dependsOn: deps,
        milestone: false,
      })
    })
    const terminals = tasks.filter((t) => !hasSuccessor.has(t.ref)).map((t) => t.ref)
    tasks.push({
      ref: gateRef(p),
      name: ph.gate,
      description: `Milestone gate closing ${ph.name}. Reached when all work in the phase is complete and accepted.`,
      days: 0,
      role: tasks.length ? tasks[tasks.length - 1].role : Object.values(tpl.roles)[0],
      dependsOn: terminals,
      milestone: true,
    })
    return { name: ph.name, tasks }
  })

  const risks: OutlineRisk[] = tpl.risks.map(([description, category, probability, impact, mitigation, role]) => ({
    description,
    category,
    probability: clamp(probability + (input.complexity === 'complex' && category === 'Technical' ? 1 : 0), 1, 5),
    impact,
    mitigation,
    ownerRole: tpl.roles[role] ?? role,
  }))
  const lead = Object.values(tpl.roles)[0]
  if (input.teamSize <= 3) {
    risks.push({
      description: `With a team of ${input.teamSize}, the absence of one person stalls several workstreams at once`,
      category: 'Resource',
      probability: 3,
      impact: 4,
      mitigation: 'Document work in progress daily, agree a named backup for every critical task and keep handover notes current.',
      ownerRole: lead,
    })
  }
  if (input.budget == null) {
    risks.push({
      description: 'No budget has been set, so cost overruns cannot be detected early',
      category: 'Cost',
      probability: 3,
      impact: 3,
      mitigation: 'Agree a budget and tolerance during initiation and report actual spend against it at each milestone.',
      ownerRole: lead,
    })
  }

  return { charter: engineCharter(input, phases), phases, risks }
}

function engineCharter(input: GeneratorInput, phases: PlanOutline['phases']): Charter {
  const tpl = TEMPLATES[input.type]
  const days = wIdxFloor(input.targetEnd) - wIdx(input.start) + 1
  const about = input.description.trim() ? ` ${firstSentence(input.description)}` : ''
  const budget = input.budget != null ? fmtMoney(input.budget) : null
  return {
    objective: `Deliver ${input.name} by ${fmtLong(input.targetEnd)}${budget ? `, within a budget of ${budget}` : ''}.${about}`,
    justification: tpl.justification,
    scope: phases.map((ph) => {
      const work = ph.tasks.filter((t) => !t.milestone).slice(0, 2).map((t) => t.name.charAt(0).toLowerCase() + t.name.slice(1))
      return `${ph.name}: ${work.join('; ')}`
    }),
    outOfScope: tpl.outOfScope,
    deliverables: phases.map((ph) => {
      const gate = ph.tasks.find((t) => t.milestone)
      return `${gate?.name ?? ph.name} (end of ${ph.name})`
    }),
    stakeholders: tpl.stakeholders,
    successCriteria: [
      `Completed on or before ${fmtLong(input.targetEnd)}`,
      ...(budget ? [`Total cost at or below ${budget}`] : []),
      ...tpl.success,
    ],
    assumptions: [
      `A team of ${input.teamSize} is available from ${fmtLong(input.start)} for the full duration`,
      'Stakeholders review and approve deliverables within three working days',
      'The schedule uses a Monday–Friday working week with no allowance for public holidays',
      budget ? 'The budget is approved and released at kickoff' : 'A budget will be confirmed during the first phase',
    ],
    constraints: [
      `Fixed target date of ${fmtLong(input.targetEnd)} (${days} working days from the start)`,
      `Team capacity of ${input.teamSize} ${input.teamSize === 1 ? 'person' : 'people'}`,
      ...(budget ? [`Budget ceiling of ${budget}`] : []),
      `${COMPLEXITY_LABEL[input.complexity]} complexity ${PROJECT_TYPE_LABEL[input.type].toLowerCase()} project`,
    ],
  }
}

interface BuildOptions {
  source: PlanSource
  /** Scale task durations so the plan finishes on the target date. */
  fit: boolean
}

/** Schedule an outline into a full project: dates, owners, priorities, risks and feasibility notes. */
export function buildProject(input: GeneratorInput, outline: PlanOutline, opts: BuildOptions): Project {
  const start = snapToWorkday(input.start)
  const startIdx = wIdx(start)
  const available = Math.max(1, wIdxFloor(input.targetEnd) - startIdx + 1)
  const notes: string[] = []

  // 1. Skeleton. A dependency is accepted only on a task that appears earlier, which rules out loops.
  const idOf = new Map<string, string>()
  const tasks: Task[] = []
  const natural = new Map<string, number>()
  const roleOf = new Map<string, string>()
  for (const ph of outline.phases) {
    if (!ph.tasks.length) continue
    const phaseId = uid('t_')
    tasks.push(blankTask(phaseId, null, ph.name, start))
    for (const t of ph.tasks) {
      const id = uid('t_')
      const days = t.milestone && t.days <= 0 ? 0 : Math.max(1, Math.round(t.days))
      tasks.push({
        ...blankTask(id, phaseId, t.name, start),
        description: t.description,
        duration: days,
        milestone: t.milestone,
        dependencies: [...new Set(t.dependsOn.map((r) => idOf.get(r)).filter((x): x is string => !!x))],
      })
      idOf.set(t.ref, id)
      natural.set(id, days)
      roleOf.set(id, t.role.trim() || 'Team Member')
    }
  }

  // 2. Durations. Find the scale at which the dependency network just fits the available window.
  const scaled = (scale: number) =>
    autoSchedule(
      tasks.map((t) => {
        const n = natural.get(t.id)
        return n ? { ...t, duration: Math.max(1, Math.round(n * scale)) } : t
      }),
      start,
    )
  const lengthOf = (ts: Task[]) => {
    let end = startIdx
    for (const t of ts) if (natural.has(t.id)) end = Math.max(end, wIdx(t.start) + Math.max(t.duration, 1) - 1)
    return end - startIdx + 1
  }
  let scheduled = scaled(1)
  const naturalLength = lengthOf(scheduled)
  if (opts.fit && naturalLength !== available) {
    let lo = naturalLength > available ? 0.05 : 1
    let hi = naturalLength > available ? 1 : 3
    let best = naturalLength > available ? scaled(lo) : scheduled
    let bestScale = lo
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2
      const trial = scaled(mid)
      if (lengthOf(trial) <= available) {
        best = trial
        bestScale = mid
        lo = mid
      } else hi = mid
    }
    scheduled = best
    // Rounding leaves a gap of a few days. Close it by lengthening critical tasks one day at a time,
    // longest first: a day added to a critical task is a day added to the plan.
    let gap = available - lengthOf(scheduled)
    for (let guard = 0; gap > 0 && guard < 60; guard++) {
      const candidates = scheduled.filter((t) => natural.has(t.id) && t.duration > 0).sort((x, y) => y.duration - x.duration)
      let grown = false
      for (const c of candidates.slice(0, 12)) {
        const trial = autoSchedule(scheduled.map((t) => (t.id === c.id ? { ...t, duration: t.duration + 1 } : t)), start)
        const g = available - lengthOf(trial)
        if (g >= 0 && g < gap) {
          scheduled = trial
          gap = g
          grown = true
          break
        }
      }
      if (!grown) break
    }
    if (naturalLength > available && bestScale < 0.7) {
      notes.push(
        `Durations were compressed to about ${Math.round(bestScale * 100)}% of typical estimates to meet the target date. Treat this schedule as aggressive.`,
      )
    }
  }
  const length = lengthOf(scheduled)
  if (length > available) {
    notes.push(
      `The target date cannot be met: the shortest workable sequence needs ${length} working days and only ${available} are available. The plan finishes on ${fmtLong(fromWIdx(startIdx + length - 1))}.`,
    )
  } else if (available - length >= 3) {
    notes.push(`The plan finishes ${available - length} working days before the target date, which is held as schedule contingency.`)
  }

  // 3. Team. Merge the lightest roles when there are fewer people than roles; split the heaviest when there are more.
  const leafIds = scheduled.filter((t) => natural.has(t.id)).map((t) => t.id)
  const durationOf = new Map(scheduled.map((t) => [t.id, t.duration]))
  const startOf = new Map(scheduled.map((t) => [t.id, wIdx(t.start)]))
  const groupsByRole = new Map<string, { roles: string[]; load: number; taskIds: string[] }>()
  for (const id of leafIds) {
    const role = roleOf.get(id)!
    const g = groupsByRole.get(role) ?? { roles: [role], load: 0, taskIds: [] }
    g.load += durationOf.get(id)!
    g.taskIds.push(id)
    groupsByRole.set(role, g)
  }
  let groups = [...groupsByRole.values()]
  const teamSize = Math.max(1, Math.round(input.teamSize))
  while (groups.length > teamSize && groups.length > 1) {
    groups.sort((a, b) => a.load - b.load)
    const [a, b, ...rest] = groups
    groups = [{ roles: [...b.roles, ...a.roles], load: a.load + b.load, taskIds: [...b.taskIds, ...a.taskIds] }, ...rest]
  }
  if (groupsByRole.size > teamSize) {
    notes.push(`The plan calls for ${groupsByRole.size} roles but the team has ${teamSize}, so some people cover more than one role.`)
  }
  const order = new Map(leafIds.map((id, i) => [id, i]))
  groups.sort((a, b) => Math.min(...a.taskIds.map((i) => order.get(i)!)) - Math.min(...b.taskIds.map((i) => order.get(i)!)))
  const headcount = groups.map(() => 1)
  let people = groups.length
  while (people < teamSize) {
    let pick = -1
    let worst = 6 // only add a person where each would still carry more than ~6 days of work
    groups.forEach((g, i) => {
      const per = g.load / headcount[i]
      if (per > worst && headcount[i] < g.taskIds.length) {
        worst = per
        pick = i
      }
    })
    if (pick < 0) break
    headcount[pick]++
    people++
  }
  if (people < teamSize) {
    notes.push(`The work breaks down into ${people} assignable roles; the other ${teamSize - people} team members are not yet assigned in this plan.`)
  }

  const resources: Resource[] = []
  const ownerOf = new Map<string, string>()
  const resourceByRole = new Map<string, string>()
  groups.forEach((g, gi) => {
    const title = g.roles.length <= 2 ? g.roles.join(' / ') : `${g.roles[0]} (+${g.roles.length - 1} roles)`
    const members = Array.from({ length: headcount[gi] }, (_, i) => {
      const r: Resource = {
        id: uid('r_'),
        name: headcount[gi] > 1 ? `${title} ${i + 1}` : title,
        role: g.roles[0],
        allocation: 100,
      }
      resources.push(r)
      return r
    })
    g.roles.forEach((role) => resourceByRole.set(role, members[0].id))
    const sorted = [...g.taskIds].sort((a, b) => order.get(a)! - order.get(b)!)
    const loads = members.map(() => 0)
    const weekly = members.map(() => new Map<number, number>())
    sorted.forEach((id) => {
      // Give each task to whoever in the group has the least work so far.
      const i = loads.indexOf(Math.min(...loads))
      ownerOf.set(id, members[i].id)
      const days = durationOf.get(id)!
      loads[i] += days
      const s = startOf.get(id)!
      for (let d = s; d < s + days; d++) {
        const w = Math.floor(d / 5)
        weekly[i].set(w, (weekly[i].get(w) ?? 0) + 1)
      }
    })
    // Suggested allocation is the share of a week the plan needs from this person in their busiest week.
    members.forEach((m, i) => {
      const peak = Math.max(0, ...weekly[i].values())
      m.allocation = clamp(Math.ceil(((peak / 5) * 100) / 10) * 10, 20, 100)
    })
  })

  // 4. Assemble, then rank priorities from the critical path.
  const horizon = startIdx + 10
  let finalTasks: Task[] = scheduled.map((t) =>
    natural.has(t.id)
      ? { ...t, ownerId: ownerOf.get(t.id) ?? null, status: wIdx(t.start) < horizon ? 'todo' : 'backlog' }
      : t,
  )
  const risks: Risk[] = outline.risks.map((r, i) => ({
    id: uid('k_'),
    code: `R-${String(i + 1).padStart(3, '0')}`,
    description: r.description,
    category: r.category || 'General',
    probability: clamp(Math.round(r.probability) || 3, 1, 5),
    impact: clamp(Math.round(r.impact) || 3, 1, 5),
    ownerId: resourceByRole.get(r.ownerRole) ?? resources[0]?.id ?? null,
    mitigation: r.mitigation,
    status: 'open',
  }))
  if (opts.fit && naturalLength > available * 1.15) {
    risks.push({
      id: uid('k_'),
      code: `R-${String(risks.length + 1).padStart(3, '0')}`,
      description: 'The schedule is compressed below typical estimates, leaving little room to absorb delays',
      category: 'Schedule',
      probability: 4,
      impact: 4,
      ownerId: resources[0]?.id ?? null,
      mitigation: 'Protect critical-path tasks from interruption, review progress twice a week and agree in advance which scope can be deferred.',
      status: 'open',
    })
  }

  const now = Date.now()
  const project: Project = {
    id: uid('p_'),
    name: input.name.trim() || 'Untitled project',
    description: input.description.trim(),
    type: input.type,
    complexity: input.complexity,
    start,
    targetEnd: input.targetEnd,
    teamSize,
    budget: input.budget,
    spent: 0,
    color: PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)],
    source: opts.source,
    planNotes: notes,
    createdAt: now,
    updatedAt: now,
    charter: outline.charter,
    tasks: finalTasks,
    risks,
    resources,
    activity: [],
  }
  const a = analyze(project)
  finalTasks = finalTasks.map((t) => {
    const row = a.byId.get(t.id)
    if (!row || row.isSummary) return t
    const priority: Priority = row.critical ? (t.milestone || t.duration >= 5 ? 'critical' : 'high') : row.slack <= 3 ? 'medium' : 'low'
    return { ...t, priority }
  })
  return { ...project, tasks: finalTasks }
}

export function blankTask(id: string, parentId: string | null, name: string, start: string): Task {
  return {
    id,
    parentId,
    name,
    description: '',
    ownerId: null,
    start,
    duration: 1,
    progress: 0,
    status: 'backlog',
    priority: 'medium',
    dependencies: [],
    milestone: false,
  }
}

/** Generate a complete plan with the built-in engine. Synchronous and offline. */
export function generateWithEngine(input: GeneratorInput, source: PlanSource = 'engine'): Project {
  return buildProject(input, engineOutline(input), { source, fit: true })
}
