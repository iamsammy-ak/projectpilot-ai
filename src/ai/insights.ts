import type { ISODate, Project, Resource, Risk } from '../types'
import { fmtShort, fromWIdx, relativeDay, todayISO } from '../lib/dates'
import { plural } from '../lib/format'
import { riskScore, severityOf, type Severity } from '../lib/risk'
import { analyze, type Analysis, type Row } from '../lib/schedule'

/**
 * Rule-based analysis over live project data. Everything here is computed from tasks, dates,
 * dependencies, owners and the risk register — nothing is canned text about a fixed project.
 */

export interface Load {
  resource: Resource
  taskCount: number
  openCount: number
  totalDays: number
  remainingDays: number
  /** Working days of assigned work in the busiest upcoming week. */
  peak: number
  /** Working days this person can give the project per week. */
  capacity: number
  overWeeks: { start: ISODate; load: number }[]
}

export function workload(p: Project, a: Analysis = analyze(p)): Load[] {
  const thisWeek = Math.floor(a.todayIdx / 5)
  return p.resources.map((resource) => {
    const mine = a.leaves.filter((r) => r.task.ownerId === resource.id)
    const weekly = new Map<number, number>()
    let remainingDays = 0
    for (const r of mine) {
      if (r.status === 'done' || r.task.duration === 0) continue
      remainingDays += Math.round(r.task.duration * (1 - r.progress / 100) * 10) / 10
      for (let i = Math.max(r.sIdx, thisWeek * 5); i <= r.eIdx; i++) {
        const w = Math.floor(i / 5)
        weekly.set(w, (weekly.get(w) ?? 0) + 1)
      }
    }
    const capacity = (5 * resource.allocation) / 100
    const overWeeks = [...weekly.entries()]
      .filter(([, load]) => load > capacity + 0.01)
      .sort((x, y) => x[0] - y[0])
      .map(([w, load]) => ({ start: fromWIdx(w * 5), load }))
    return {
      resource,
      taskCount: mine.length,
      openCount: mine.filter((r) => r.status !== 'done').length,
      totalDays: mine.reduce((s, r) => s + r.task.duration, 0),
      remainingDays: Math.round(remainingDays * 10) / 10,
      peak: Math.max(0, ...weekly.values()),
      capacity,
      overWeeks,
    }
  })
}

/** Number of not-yet-finished tasks that sit downstream of a task. */
export function downstreamCount(a: Analysis, id: string): number {
  const seen = new Set<string>()
  const stack = [...(a.byId.get(id)?.succs ?? [])]
  while (stack.length) {
    const cur = stack.pop()!
    if (seen.has(cur)) continue
    seen.add(cur)
    stack.push(...(a.byId.get(cur)?.succs ?? []))
  }
  let n = 0
  for (const s of seen) if (a.byId.get(s)!.status !== 'done') n++
  return n
}

/** Unfinished tasks that other work is waiting on, most consequential first. */
export function blockers(a: Analysis): { row: Row; waiting: number; late: boolean }[] {
  return a.leaves
    .filter((r) => r.status !== 'done' && r.succs.some((s) => a.byId.get(s)!.status !== 'done'))
    .map((row) => ({ row, waiting: downstreamCount(a, row.id), late: row.overdue }))
    .filter((b) => b.late || b.row.sIdx <= a.todayIdx)
    .sort((x, y) => Number(y.late) - Number(x.late) || y.waiting - x.waiting)
}

export type Tone = 'critical' | 'warning' | 'info' | 'good'

export interface Insight {
  id: string
  tone: Tone
  title: string
  detail: string
  projectId: string
  projectName: string
  taskId?: string
  /** Where "View" should take the user. */
  route: string
}

export interface InsightGroups {
  atRisk: Insight[]
  deadlines: Insight[]
  resources: Insight[]
  improvements: Insight[]
}

export function projectInsights(p: Project, today: ISODate = todayISO()): InsightGroups {
  const a = analyze(p, today)
  const base = { projectId: p.id, projectName: p.name }
  const out: InsightGroups = { atRisk: [], deadlines: [], resources: [], improvements: [] }
  if (a.health.label === 'Completed') return out

  // Projects at risk
  if (a.health.label === 'At Risk' || a.health.label === 'Off Track') {
    const parts: string[] = []
    if (a.overdue.length) parts.push(`${plural(a.overdue.length, 'task')} overdue`)
    if (a.varianceDays > 0) parts.push(`${plural(a.varianceDays, 'working day')} behind plan`)
    if (a.slipDays > 0) parts.push(`forecast to finish ${plural(a.slipDays, 'working day')} after the target`)
    const openHigh = p.risks.filter((r) => r.status !== 'closed' && riskScore(r) >= 10).length
    if (openHigh) parts.push(`${plural(openHigh, 'open high-severity risk')}`)
    out.atRisk.push({
      ...base,
      id: `${p.id}-health`,
      tone: a.health.label === 'Off Track' ? 'critical' : 'warning',
      title: `${p.name} is ${a.health.label.toLowerCase()}`,
      detail: `Health score ${a.health.score}/100: ${parts.join(', ') || 'progress is slower than planned'}.`,
      route: 'gantt',
    })
  }

  // Upcoming critical deadlines
  const soon = a.leaves
    .filter((r) => r.status !== 'done' && (r.critical || r.task.milestone) && r.eIdx <= a.todayIdx + 9)
    .sort((x, y) => x.eIdx - y.eIdx)
    .slice(0, 4)
  for (const r of soon) {
    out.deadlines.push({
      ...base,
      id: `${p.id}-due-${r.id}`,
      tone: r.overdue ? 'critical' : r.eIdx <= a.todayIdx + 2 ? 'warning' : 'info',
      title: `${r.task.milestone ? 'Milestone' : 'Critical task'}: ${r.task.name}`,
      detail: r.overdue
        ? `Was due ${fmtShort(r.end)} (${relativeDay(r.end, today)}) and is ${r.progress}% complete.`
        : `Due ${fmtShort(r.end)} (${relativeDay(r.end, today)}), currently ${r.progress}% complete.`,
      taskId: r.id,
      route: 'gantt',
    })
  }

  // Resource allocation warnings
  for (const l of workload(p, a)) {
    const next = l.overWeeks.filter((w) => w.start <= fromWIdx(a.todayIdx + 14))
    if (!next.length) continue
    const worst = next.reduce((m, w) => (w.load > m.load ? w : m))
    out.resources.push({
      ...base,
      id: `${p.id}-load-${l.resource.id}`,
      tone: worst.load >= l.capacity * 1.6 ? 'critical' : 'warning',
      title: `${l.resource.name} is over-allocated`,
      detail: `${worst.load} days of work scheduled in the week of ${fmtShort(worst.start)} against a capacity of ${l.capacity} days.`,
      route: 'board',
    })
  }
  const unowned = a.leaves.filter((r) => r.status !== 'done' && !r.task.ownerId && r.sIdx <= a.todayIdx + 10)
  if (unowned.length) {
    out.resources.push({
      ...base,
      id: `${p.id}-unowned`,
      tone: 'warning',
      title: `${plural(unowned.length, 'task')} starting soon ${unowned.length === 1 ? 'has' : 'have'} no owner`,
      detail: `First is ${unowned[0].code} ${unowned[0].task.name}, starting ${fmtShort(unowned[0].start)}.`,
      taskId: unowned[0].id,
      route: 'wbs',
    })
  }

  // Suggested improvements
  const top = blockers(a)[0]
  if (top && top.waiting >= 2) {
    out.improvements.push({
      ...base,
      id: `${p.id}-unblock-${top.row.id}`,
      tone: top.late ? 'critical' : 'info',
      title: `Unblock ${top.row.code} ${top.row.task.name}`,
      detail: `${plural(top.waiting, 'downstream task')} cannot finish until this is done${top.late ? ', and it is already overdue' : ''}. Adding help here has the largest effect on the schedule.`,
      taskId: top.row.id,
      route: 'gantt',
    })
  }
  const longest = a.critical
    .filter((r) => r.status !== 'done' && r.task.duration >= 4)
    .sort((x, y) => y.task.duration - x.task.duration)[0]
  if (longest) {
    out.improvements.push({
      ...base,
      id: `${p.id}-split-${longest.id}`,
      tone: 'info',
      title: `Shorten the critical path at ${longest.code}`,
      detail: `${longest.task.name} is the longest remaining critical task (${longest.task.duration} days). Splitting it into parallel subtasks or adding a second owner brings the finish date forward.`,
      taskId: longest.id,
      route: 'wbs',
    })
  }
  const stalled = a.leaves.filter((r) => (r.status === 'todo' || r.status === 'backlog') && r.sIdx < a.todayIdx && r.preds.every((x) => a.byId.get(x)!.status === 'done'))
  if (stalled.length) {
    out.improvements.push({
      ...base,
      id: `${p.id}-stalled`,
      tone: 'warning',
      title: `${plural(stalled.length, 'task')} ready to start but not started`,
      detail: `${stalled.slice(0, 2).map((r) => `${r.code} ${r.task.name}`).join(' and ')} ${stalled.length > 2 ? `and ${stalled.length - 2} more ` : ''}had a planned start in the past and nothing blocks them.`,
      taskId: stalled[0].id,
      route: 'board',
    })
  }
  const unmitigated = p.risks.filter((r) => r.status === 'open' && riskScore(r) >= 10)
  if (unmitigated.length) {
    out.improvements.push({
      ...base,
      id: `${p.id}-risks`,
      tone: unmitigated.some((r) => riskScore(r) >= 16) ? 'critical' : 'warning',
      title: `${plural(unmitigated.length, 'high-severity risk')} without active mitigation`,
      detail: `Highest is ${unmitigated.sort((x, y) => riskScore(y) - riskScore(x))[0].code} (score ${riskScore(unmitigated[0])}). Assign an owner and start the mitigation plan.`,
      route: 'risks',
    })
  }
  return out
}

export function portfolioInsights(projects: Project[], today: ISODate = todayISO()): InsightGroups {
  const all: InsightGroups = { atRisk: [], deadlines: [], resources: [], improvements: [] }
  for (const p of projects) {
    const g = projectInsights(p, today)
    all.atRisk.push(...g.atRisk)
    all.deadlines.push(...g.deadlines)
    all.resources.push(...g.resources)
    all.improvements.push(...g.improvements)
  }
  const rank: Record<Tone, number> = { critical: 0, warning: 1, info: 2, good: 3 }
  const sort = (list: Insight[]) => list.sort((x, y) => rank[x.tone] - rank[y.tone])
  return {
    atRisk: sort(all.atRisk).slice(0, 4),
    deadlines: sort(all.deadlines).slice(0, 4),
    resources: sort(all.resources).slice(0, 4),
    improvements: sort(all.improvements).slice(0, 4),
  }
}

/* ───────────────────────────── AI Risk Analyst ───────────────────────────── */

export interface Recommendation {
  id: string
  severity: Severity
  title: string
  detail: string
  action: string
  taskId?: string
  /** A register entry the user can add with one click. */
  suggested?: Pick<Risk, 'description' | 'category' | 'probability' | 'impact' | 'mitigation' | 'ownerId'>
}

export function riskRecommendations(p: Project, today: ISODate = todayISO()): Recommendation[] {
  const a = analyze(p, today)
  const recs: Recommendation[] = []
  if (a.health.label === 'Completed') return recs
  const known = (text: string) => p.risks.some((r) => r.description.toLowerCase() === text.toLowerCase())
  const push = (r: Recommendation) => {
    if (r.suggested && known(r.suggested.description)) delete r.suggested
    recs.push(r)
  }
  const remaining = a.leaves.filter((r) => r.status !== 'done')

  // 1. Overdue work on the critical path
  const lateCritical = a.overdue.filter((r) => r.critical).sort((x, y) => x.eIdx - y.eIdx)
  if (lateCritical.length) {
    const r = lateCritical[0]
    push({
      id: 'late-critical',
      severity: 'Critical',
      title: `${plural(lateCritical.length, 'critical-path task')} overdue`,
      detail: `${r.code} ${r.task.name} was due ${fmtShort(r.end)} and is ${r.progress}% complete. Every day it slips moves the project finish by a day.`,
      action: 'Re-plan the task today: add capacity, cut its scope to the minimum needed by successors, or re-sequence dependent work.',
      taskId: r.id,
      suggested: {
        description: `Delay to ${r.code} ${r.task.name} pushes the project finish date`,
        category: 'Schedule',
        probability: 5,
        impact: 4,
        mitigation: `Assign a second person to ${r.task.name}, review progress daily until it is complete and re-baseline dependent tasks.`,
        ownerId: r.task.ownerId,
      },
    })
  }

  // 2. Forecast against the target date
  if (a.slipDays > 0) {
    push({
      id: 'deadline',
      severity: a.slipDays > 5 ? 'Critical' : 'High',
      title: `Forecast finish is ${plural(a.slipDays, 'working day')} after the target`,
      detail: `Planned progress is ${a.planned}% and actual is ${a.percent}% (SPI ${a.spi.toFixed(2)}). At this pace the project finishes around ${fmtShort(a.forecastEnd)} against a target of ${fmtShort(p.targetEnd)}.`,
      action: 'Recover time on the critical path, or agree a revised date or reduced scope with the sponsor now rather than at the end.',
      suggested: {
        description: 'Project misses its target completion date at the current rate of progress',
        category: 'Schedule',
        probability: a.slipDays > 5 ? 4 : 3,
        impact: 4,
        mitigation: 'Fast-track remaining critical tasks, defer non-essential scope to a later release and report the forecast weekly to the sponsor.',
        ownerId: null,
      },
    })
  }

  // 3. Dependency bottlenecks
  const hubs = remaining
    .map((r) => ({ r, n: r.succs.filter((s) => a.byId.get(s)!.status !== 'done').length, down: downstreamCount(a, r.id) }))
    .filter((x) => x.n >= 3 || x.down >= 8)
    .sort((x, y) => y.down - x.down)
  if (hubs.length) {
    const h = hubs[0]
    push({
      id: `hub-${h.r.id}`,
      severity: h.r.critical ? 'High' : 'Medium',
      title: `${h.r.code} ${h.r.task.name} is a dependency bottleneck`,
      detail: `${plural(h.n, 'task')} ${h.n === 1 ? 'depends' : 'depend'} on it directly and ${h.down} sit downstream. A delay here spreads across the plan.`,
      action: 'Start it as early as possible, define its outputs precisely and let dependent teams work against an agreed interface or draft.',
      taskId: h.r.id,
      suggested: {
        description: `${h.r.task.name} is a single point of dependency for ${h.down} downstream tasks`,
        category: 'Dependency',
        probability: 3,
        impact: 4,
        mitigation: 'Agree interim deliverables so dependent work can begin early, and review this task at every stand-up.',
        ownerId: h.r.task.ownerId,
      },
    })
  }

  // 4. Schedule flexibility
  const remainingCritical = remaining.filter((r) => r.critical && r.task.duration > 0)
  const withWork = remaining.filter((r) => r.task.duration > 0)
  if (withWork.length >= 6 && remainingCritical.length / withWork.length > 0.55) {
    push({
      id: 'low-float',
      severity: 'High',
      title: 'Very little schedule float remains',
      detail: `${remainingCritical.length} of ${withWork.length} remaining tasks have zero slack, so almost any delay moves the finish date.`,
      action: 'Create float by running independent tasks in parallel, or hold explicit contingency before the final milestone.',
    })
  }

  // 5. Resource overload and key-person dependency
  const loads = workload(p, a)
  const over = loads.filter((l) => l.overWeeks.length).sort((x, y) => y.peak / y.capacity - x.peak / x.capacity)
  if (over.length) {
    const l = over[0]
    push({
      id: `over-${l.resource.id}`,
      severity: l.peak >= l.capacity * 1.6 ? 'High' : 'Medium',
      title: `${l.resource.name} is over-allocated in ${plural(l.overWeeks.length, 'week')}`,
      detail: `Peak load is ${l.peak} days in the week of ${fmtShort(l.overWeeks[0].start)} against ${l.capacity} days of capacity.`,
      action: 'Reassign or re-sequence overlapping tasks; over-allocated owners are the most common cause of silent slippage.',
      suggested: {
        description: `${l.resource.name} (${l.resource.role}) is over-allocated, putting assigned tasks at risk of delay`,
        category: 'Resource',
        probability: 4,
        impact: 3,
        mitigation: 'Level the workload by moving non-critical tasks or sharing them with another team member.',
        ownerId: null,
      },
    })
  }
  const critDays = remainingCritical.reduce((s, r) => s + r.task.duration, 0)
  if (critDays > 0) {
    const byOwner = new Map<string, number>()
    for (const r of remainingCritical) if (r.task.ownerId) byOwner.set(r.task.ownerId, (byOwner.get(r.task.ownerId) ?? 0) + r.task.duration)
    const top = [...byOwner.entries()].sort((x, y) => y[1] - x[1])[0]
    const person = top && p.resources.find((r) => r.id === top[0])
    const days = top?.[1] ?? 0
    if (person && days / critDays >= 0.35 && p.resources.length > 2) {
      push({
        id: `key-${person.id}`,
        severity: 'Medium',
        title: `${person.name} carries ${Math.round((days / critDays) * 100)}% of the remaining critical work`,
        detail: `${days} of ${critDays} critical-path days depend on one person. Illness or reassignment would stall the project.`,
        action: 'Pair a second person on these tasks and keep working notes current so someone else can take over.',
        suggested: {
          description: `Key-person dependency: ${person.name} owns most of the remaining critical-path work`,
          category: 'Resource',
          probability: 2,
          impact: 5,
          mitigation: 'Cross-train a backup, document work in progress and review their workload weekly.',
          ownerId: null,
        },
      })
    }
  }

  // 6. Milestones close to today with unfinished predecessors
  const gate = a.milestones
    .filter((m) => m.status !== 'done' && m.eIdx <= a.todayIdx + 7)
    .map((m) => ({ m, open: m.preds.filter((x) => a.byId.get(x)!.status !== 'done') }))
    .filter((x) => x.open.length)
    .sort((x, y) => x.m.eIdx - y.m.eIdx)[0]
  if (gate) {
    const first = a.byId.get(gate.open[0])!
    push({
      id: `gate-${gate.m.id}`,
      severity: gate.m.overdue ? 'High' : 'Medium',
      title: `Milestone "${gate.m.task.name}" is at risk`,
      detail: `It is due ${fmtShort(gate.m.end)} and ${plural(gate.open.length, 'predecessor')} ${gate.open.length === 1 ? 'is' : 'are'} unfinished, starting with ${first.code} ${first.task.name} (${first.progress}%).`,
      action: 'Confirm with the task owner what is needed to close it, and warn stakeholders if the milestone will move.',
      taskId: first.id,
    })
  }

  // 7. Register hygiene
  const open = p.risks.filter((r) => r.status === 'open' && riskScore(r) >= 10).sort((x, y) => riskScore(y) - riskScore(x))
  if (open.length) {
    push({
      id: 'unmitigated',
      severity: severityOf(riskScore(open[0])),
      title: `${plural(open.length, 'high-severity risk')} with no mitigation under way`,
      detail: `${open.slice(0, 3).map((r) => `${r.code} (score ${riskScore(r)})`).join(', ')} ${open.length === 1 ? 'is' : 'are'} still marked Open.`,
      action: 'Move each to Mitigating once its plan has an owner and a first action, starting with the highest score.',
    })
  }
  const noOwner = p.risks.filter((r) => r.status !== 'closed' && !r.ownerId)
  if (noOwner.length) {
    push({
      id: 'no-owner',
      severity: 'Low',
      title: `${plural(noOwner.length, 'risk')} without an owner`,
      detail: `${noOwner.slice(0, 3).map((r) => r.code).join(', ')} ${noOwner.length === 1 ? 'has' : 'have'} nobody accountable for the mitigation.`,
      action: 'Assign an owner to each risk in the register.',
    })
  }

  // 8. Compressed testing or closing phases
  const test = a.phases.find((ph) => /test|quality|qa|validation/i.test(ph.task.name))
  if (test && test.status !== 'done') {
    const share = test.duration / Math.max(1, a.eIdx - a.sIdx + 1)
    if (share < 0.12) {
      push({
        id: 'thin-testing',
        severity: 'Medium',
        title: 'Testing window is short for the size of the project',
        detail: `${test.task.name} spans ${test.duration} working days, about ${Math.round(share * 100)}% of the schedule. Late defects would have little room to be fixed.`,
        action: 'Begin test preparation earlier and run acceptance previews during development.',
      })
    }
  }

  const order: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  return recs.sort((x, y) => order[x.severity] - order[y.severity])
}
