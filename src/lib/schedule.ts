import type { ISODate, Project, Status, Task } from '../types'
import { fromWIdx, todayISO, wIdx, wIdxFloor } from './dates'
import { riskScore } from './risk'

/**
 * Scheduling engine: WBS tree, dependency graph, date roll-ups, critical path and project health.
 * Every view (WBS, Gantt, board, dashboard, reports, assistant) reads the same `analyze()` result,
 * which is what keeps them consistent.
 */

export type HealthLabel = 'On Track' | 'At Risk' | 'Off Track' | 'Completed' | 'Not Started'

export interface Row {
  task: Task
  id: string
  /** WBS code such as "3.0", "3.2" or "3.2.1". */
  code: string
  depth: number
  /** Top-level ancestor (the phase). */
  phaseId: string
  isSummary: boolean
  childIds: string[]
  /** Leaf descendants; `[id]` for a leaf. */
  leafIds: string[]
  sIdx: number
  eIdx: number
  start: ISODate
  end: ISODate
  /** Working days. For a summary task this is the span of its children. */
  duration: number
  progress: number
  status: Status
  critical: boolean
  /** Working days this task can slip without moving the project finish. */
  slack: number
  overdue: boolean
  /** Leaf predecessors / successors after expanding phase-level dependencies. */
  preds: string[]
  succs: string[]
}

export interface Analysis {
  rows: Row[]
  byId: Map<string, Row>
  leaves: Row[]
  phases: Row[]
  milestones: Row[]
  critical: Row[]
  overdue: Row[]
  counts: Record<Status, number>
  sIdx: number
  eIdx: number
  start: ISODate
  end: ISODate
  targetIdx: number
  todayIdx: number
  /** Earned progress, 0–100, weighted by task duration. */
  percent: number
  /** Progress the schedule expects by today, 0–100. */
  planned: number
  /** Schedule performance index (earned / planned). 1 when nothing was due yet. */
  spi: number
  /** Working days behind (+) or ahead (−) of plan. */
  varianceDays: number
  /** Scheduled finish adjusted for the current slip. */
  forecastIdx: number
  forecastEnd: ISODate
  /** Forecast finish minus target, in working days. Positive means late. */
  slipDays: number
  health: { score: number; label: HealthLabel }
}

interface Graph {
  ordered: Task[]
  byId: Map<string, Task>
  children: Map<string, string[]>
  depth: Map<string, number>
  code: Map<string, string>
  phaseOf: Map<string, string>
  leafIds: Map<string, string[]>
  leaves: Task[]
  preds: Map<string, string[]>
  succs: Map<string, string[]>
  /** Leaf ids, predecessors first. */
  topo: string[]
  cyclic: boolean
}

export function buildGraph(tasks: Task[]): Graph {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const children = new Map<string, string[]>()
  const roots: string[] = []
  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId)) {
      const list = children.get(t.parentId)
      if (list) list.push(t.id)
      else children.set(t.parentId, [t.id])
    } else roots.push(t.id)
  }

  const ordered: Task[] = []
  const depth = new Map<string, number>()
  const code = new Map<string, string>()
  const phaseOf = new Map<string, string>()
  const leafIds = new Map<string, string[]>()
  const leaves: Task[] = []

  const visit = (id: string, d: number, prefix: string, phase: string): string[] => {
    const t = byId.get(id)!
    ordered.push(t)
    depth.set(id, d)
    code.set(id, d === 0 ? `${prefix}.0` : prefix)
    phaseOf.set(id, phase)
    const kids = children.get(id)
    if (!kids?.length) {
      leaves.push(t)
      leafIds.set(id, [id])
      return [id]
    }
    const acc: string[] = []
    kids.forEach((k, i) => acc.push(...visit(k, d + 1, `${prefix}.${i + 1}`, phase)))
    leafIds.set(id, acc)
    return acc
  }
  roots.forEach((r, i) => visit(r, 0, String(i + 1), r))

  // Effective predecessors of a leaf: its own dependencies plus those of every ancestor,
  // with summary predecessors expanded to their leaves.
  const preds = new Map<string, string[]>()
  const succs = new Map<string, string[]>()
  for (const leaf of leaves) succs.set(leaf.id, [])
  for (const leaf of leaves) {
    const set = new Set<string>()
    let cur: Task | undefined = leaf
    while (cur) {
      for (const dep of cur.dependencies) for (const l of leafIds.get(dep) ?? []) set.add(l)
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    set.delete(leaf.id)
    const list = [...set]
    preds.set(leaf.id, list)
    for (const p of list) succs.get(p)!.push(leaf.id)
  }

  // Kahn's algorithm, visiting in WBS order so results are stable.
  const indeg = new Map(leaves.map((l) => [l.id, preds.get(l.id)!.length]))
  const queue = leaves.filter((l) => indeg.get(l.id) === 0).map((l) => l.id)
  const topo: string[] = []
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]
    topo.push(id)
    for (const s of succs.get(id)!) {
      const n = indeg.get(s)! - 1
      indeg.set(s, n)
      if (n === 0) queue.push(s)
    }
  }
  const cyclic = topo.length < leaves.length
  if (cyclic) {
    const seen = new Set(topo)
    for (const l of leaves) if (!seen.has(l.id)) topo.push(l.id)
  }

  return { ordered, byId, children, depth, code, phaseOf, leafIds, leaves, preds, succs, topo, cyclic }
}

const span = (t: Task) => Math.max(t.duration, 1)
const endIdx = (t: Task, s: number) => s + span(t) - 1

/** Earliest working-day index a leaf may start given where its predecessors currently finish. */
function earliestStart(g: Graph, leaf: Task, starts: Map<string, number>): number | null {
  const ps = g.preds.get(leaf.id)!
  if (!ps.length) return null
  let maxEnd = -Infinity
  for (const p of ps) maxEnd = Math.max(maxEnd, endIdx(g.byId.get(p)!, starts.get(p)!))
  // A zero-duration gate lands on the day its predecessors finish; real work starts the day after.
  return leaf.duration === 0 ? maxEnd : maxEnd + 1
}

function applyStarts(tasks: Task[], starts: Map<string, number>): Task[] {
  let changed = false
  const next = tasks.map((t) => {
    const s = starts.get(t.id)
    if (s === undefined) return t
    const iso = fromWIdx(s)
    if (iso === t.start) return t
    changed = true
    return { ...t, start: iso }
  })
  return changed ? next : tasks
}

/** Push tasks later wherever a finish-to-start dependency is violated. Never pulls a task earlier. */
export function cascade(tasks: Task[]): Task[] {
  const g = buildGraph(tasks)
  if (g.cyclic) return tasks
  const starts = new Map(g.leaves.map((l) => [l.id, wIdx(l.start)]))
  for (const id of g.topo) {
    const leaf = g.byId.get(id)!
    const es = earliestStart(g, leaf, starts)
    if (es !== null && starts.get(id)! < es) starts.set(id, es)
  }
  return applyStarts(tasks, starts)
}

/**
 * Re-plan as-soon-as-possible: every task that has not started moves to the earliest date its
 * dependencies allow. Work already in progress or finished keeps its dates.
 */
export function autoSchedule(tasks: Task[], projectStart: ISODate): Task[] {
  const g = buildGraph(tasks)
  if (g.cyclic) return tasks
  const floor = wIdx(projectStart)
  const starts = new Map(g.leaves.map((l) => [l.id, wIdx(l.start)]))
  for (const id of g.topo) {
    const leaf = g.byId.get(id)!
    const es = earliestStart(g, leaf, starts)
    const started = leaf.status === 'in_progress' || leaf.status === 'review' || leaf.status === 'done'
    if (started) continue
    if (es !== null) starts.set(id, Math.max(es, floor))
    else starts.set(id, Math.max(starts.get(id)!, floor))
  }
  return applyStarts(tasks, starts)
}

export function descendantIds(tasks: Task[], id: string): string[] {
  const out: string[] = []
  const walk = (pid: string) => {
    for (const t of tasks) {
      if (t.parentId === pid) {
        out.push(t.id)
        walk(t.id)
      }
    }
  }
  walk(id)
  return out
}

/** True if making `predId` a predecessor of `taskId` is invalid (self, ancestor/descendant, or a loop). */
export function wouldCycle(tasks: Task[], taskId: string, predId: string): boolean {
  if (taskId === predId) return true
  if (descendantIds(tasks, taskId).includes(predId)) return true
  if (descendantIds(tasks, predId).includes(taskId)) return true
  const trial = tasks.map((t) => (t.id === taskId ? { ...t, dependencies: [...t.dependencies, predId] } : t))
  return buildGraph(trial).cyclic
}

function rollupStatus(statuses: Status[]): Status {
  if (statuses.every((s) => s === 'done')) return 'done'
  if (statuses.every((s) => s === 'backlog')) return 'backlog'
  if (statuses.every((s) => s === 'backlog' || s === 'todo')) return 'todo'
  if (statuses.every((s) => s === 'done' || s === 'review')) return 'review'
  return 'in_progress'
}

const cache = new WeakMap<Project, { today: ISODate; analysis: Analysis }>()

export function analyze(project: Project, today: ISODate = todayISO()): Analysis {
  const hit = cache.get(project)
  if (hit && hit.today === today) return hit.analysis
  const analysis = compute(project, today)
  cache.set(project, { today, analysis })
  return analysis
}

function compute(project: Project, today: ISODate): Analysis {
  const g = buildGraph(project.tasks)
  const todayIdx = wIdx(today)
  const targetIdx = wIdxFloor(project.targetEnd)
  const byId = new Map<string, Row>()

  // Leaves first, then summaries bottom-up (reverse tree order guarantees children are ready).
  for (const t of g.leaves) {
    const s = wIdx(t.start)
    const e = endIdx(t, s)
    byId.set(t.id, {
      task: t,
      id: t.id,
      code: g.code.get(t.id)!,
      depth: g.depth.get(t.id)!,
      phaseId: g.phaseOf.get(t.id)!,
      isSummary: false,
      childIds: [],
      leafIds: [t.id],
      sIdx: s,
      eIdx: e,
      start: fromWIdx(s),
      end: fromWIdx(e),
      duration: t.duration,
      progress: t.progress,
      status: t.status,
      critical: false,
      slack: 0,
      overdue: t.status !== 'done' && e < todayIdx,
      preds: g.preds.get(t.id)!,
      succs: g.succs.get(t.id)!,
    })
  }

  const projectEnd = g.leaves.length ? Math.max(...g.leaves.map((l) => byId.get(l.id)!.eIdx)) : wIdx(project.start)
  const projectStart = g.leaves.length ? Math.min(...g.leaves.map((l) => byId.get(l.id)!.sIdx)) : wIdx(project.start)

  // Backward pass: latest start that still protects the project finish.
  const latestStart = new Map<string, number>()
  for (let i = g.topo.length - 1; i >= 0; i--) {
    const row = byId.get(g.topo[i])!
    let lf = projectEnd
    for (const sId of row.succs) {
      const ls = latestStart.get(sId)
      if (ls === undefined) continue
      lf = Math.min(lf, byId.get(sId)!.task.duration === 0 ? ls : ls - 1)
    }
    const ls = lf - (span(row.task) - 1)
    latestStart.set(row.id, ls)
    row.slack = ls - row.sIdx
    row.critical = row.slack <= 0
  }

  for (let i = g.ordered.length - 1; i >= 0; i--) {
    const t = g.ordered[i]
    const childIds = g.children.get(t.id)
    if (!childIds?.length) continue
    const kids = childIds.map((c) => byId.get(c)!)
    const leafRows = g.leafIds.get(t.id)!.map((l) => byId.get(l)!)
    const s = Math.min(...kids.map((k) => k.sIdx))
    const e = Math.max(...kids.map((k) => k.eIdx))
    const weight = leafRows.reduce((a, r) => a + r.task.duration, 0)
    const progress = weight
      ? leafRows.reduce((a, r) => a + r.task.duration * r.progress, 0) / weight
      : (leafRows.filter((r) => r.status === 'done').length / leafRows.length) * 100
    const status = rollupStatus(leafRows.map((r) => r.status))
    byId.set(t.id, {
      task: t,
      id: t.id,
      code: g.code.get(t.id)!,
      depth: g.depth.get(t.id)!,
      phaseId: g.phaseOf.get(t.id)!,
      isSummary: true,
      childIds,
      leafIds: g.leafIds.get(t.id)!,
      sIdx: s,
      eIdx: e,
      start: fromWIdx(s),
      end: fromWIdx(e),
      duration: e - s + 1,
      progress: Math.round(progress),
      status,
      critical: leafRows.some((r) => r.critical),
      slack: Math.min(...leafRows.map((r) => r.slack)),
      overdue: status !== 'done' && e < todayIdx,
      preds: [],
      succs: [],
    })
  }

  const rows = g.ordered.map((t) => byId.get(t.id)!)
  const leaves = rows.filter((r) => !r.isSummary)
  const counts: Record<Status, number> = { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 }
  let work = 0
  let earned = 0
  let plannedWork = 0
  for (const r of leaves) {
    counts[r.status]++
    const w = r.task.duration
    work += w
    earned += (w * r.progress) / 100
    const frac = todayIdx > r.eIdx ? 1 : todayIdx <= r.sIdx ? 0 : (todayIdx - r.sIdx) / span(r.task)
    plannedWork += w * frac
  }
  const allDone = leaves.length > 0 && counts.done === leaves.length
  const percent = allDone ? 100 : work ? (earned / work) * 100 : 0
  const planned = work ? (plannedWork / work) * 100 : 0
  const spi = plannedWork > 0 ? Math.min(earned / plannedWork, 2) : 1
  const totalSpan = projectEnd - projectStart + 1
  const varianceDays = allDone ? 0 : Math.round(((planned - percent) / 100) * totalSpan)
  const forecastIdx = projectEnd + Math.max(0, varianceDays)
  const slipDays = forecastIdx - targetIdx
  const overdue = leaves.filter((r) => r.overdue)

  // Health: start from 100 and subtract for schedule slip, overdue work, open risk and a missed target.
  let score = 100
  if (spi < 1) score -= Math.min(45, (1 - spi) * 120)
  score -= Math.min(25, overdue.length * 5)
  let riskPenalty = 0
  for (const r of project.risks) {
    if (r.status === 'closed') continue
    const s = riskScore(r)
    if (s >= 16) riskPenalty += 5
    else if (s >= 10) riskPenalty += 2
  }
  score -= Math.min(18, riskPenalty)
  if (slipDays > 0) score -= Math.min(15, slipDays * 1.5)
  score = Math.max(0, Math.round(score))
  const label: HealthLabel = allDone
    ? 'Completed'
    : todayIdx < projectStart && percent === 0
      ? 'Not Started'
      : score >= 78
        ? 'On Track'
        : score >= 58
          ? 'At Risk'
          : 'Off Track'

  return {
    rows,
    byId,
    leaves,
    phases: rows.filter((r) => r.depth === 0),
    milestones: leaves.filter((r) => r.task.milestone),
    critical: leaves.filter((r) => r.critical),
    overdue,
    counts,
    sIdx: projectStart,
    eIdx: projectEnd,
    start: fromWIdx(projectStart),
    end: fromWIdx(projectEnd),
    targetIdx,
    todayIdx,
    percent: Math.round(percent),
    planned: Math.round(planned),
    spi,
    varianceDays,
    forecastIdx,
    forecastEnd: fromWIdx(forecastIdx),
    slipDays,
    health: { score: allDone ? 100 : score, label },
  }
}

/** Rows that should be visible given a set of collapsed summary ids. */
export function visibleRows(rows: Row[], collapsed: Record<string, boolean>): Row[] {
  const hidden = new Set<string>()
  const out: Row[] = []
  for (const r of rows) {
    const parent = r.task.parentId
    if (parent && (hidden.has(parent) || collapsed[parent])) {
      hidden.add(r.id)
      continue
    }
    out.push(r)
  }
  return out
}

/** Planned and earned progress (0–100) at each working day of the project — the S-curve. */
export function progressCurve(a: Analysis): { idx: number; date: ISODate; planned: number; actual: number | null }[] {
  const work = a.leaves.reduce((s, r) => s + r.task.duration, 0) || 1
  const points: { idx: number; date: ISODate; planned: number; actual: number | null }[] = []
  const step = Math.max(1, Math.round((a.eIdx - a.sIdx + 1) / 40))
  for (let i = a.sIdx; i <= a.eIdx + step; i += step) {
    const idx = Math.min(i, a.eIdx + 1)
    let planned = 0
    for (const r of a.leaves) {
      const sp = Math.max(r.task.duration, 1)
      const frac = idx > r.eIdx ? 1 : idx <= r.sIdx ? 0 : (idx - r.sIdx) / sp
      planned += r.task.duration * frac
    }
    points.push({ idx, date: fromWIdx(idx), planned: Math.round((planned / work) * 100), actual: null })
    if (idx > a.eIdx) break
  }
  // Actual progress is only known as of today; draw a straight ramp to it as an honest approximation.
  const last = points.filter((p) => p.idx <= a.todayIdx)
  last.forEach((p, i) => {
    p.actual = last.length > 1 ? Math.round((a.percent * i) / (last.length - 1)) : a.percent
  })
  return points
}
