import { projectInsights, riskRecommendations } from '../ai/insights'
import type { ISODate, Project, Risk } from '../types'
import { PRIORITY_LABEL, RISK_STATUS_LABEL, STATUS_LABEL } from '../types'
import { fmtLong, todayISO } from './dates'
import { plural, toCSV } from './format'
import { riskScore, severityOf, type Severity } from './risk'
import { analyze, type Analysis, type Row } from './schedule'

/**
 * Everything the executive report shows, computed once from live project data.
 * The on-screen report and the PDF export both render this, so they cannot disagree.
 */

export interface BudgetView {
  /** Budget at completion. */
  bac: number
  /** Planned value: budget × planned progress. */
  pv: number
  /** Earned value: budget × actual progress. */
  ev: number
  /** Actual cost to date. */
  ac: number
  /** Cost performance index (EV / AC); null until money has been spent. */
  cpi: number | null
  /** Estimate at completion if cost efficiency stays the same. */
  eac: number
  /** BAC − EAC. Negative means a forecast overrun. */
  variance: number
}

export interface ReportRisk {
  risk: Risk
  score: number
  severity: Severity
  owner: string
}

export interface ReportAction {
  title: string
  detail: string
}

export interface ReportData {
  today: ISODate
  a: Analysis
  summary: string
  budget: BudgetView | null
  phases: Row[]
  milestones: Row[]
  risks: ReportRisk[]
  openRisks: number
  actions: ReportAction[]
}

export const ownerName = (p: Project, id: string | null) => p.resources.find((r) => r.id === id)?.name ?? 'Unassigned'

export function budgetView(p: Project, a: Analysis): BudgetView | null {
  if (p.budget == null) return null
  const bac = p.budget
  const ev = (bac * a.percent) / 100
  const pv = (bac * a.planned) / 100
  const ac = p.spent
  const cpi = ac > 0 ? ev / ac : null
  // With no earned value yet, assume the remaining work costs what was budgeted for it.
  const eac = cpi && cpi > 0 ? bac / cpi : ac + (bac - ev)
  return { bac, pv, ev, ac, cpi, eac, variance: bac - eac }
}

function summaryText(p: Project, a: Analysis, today: ISODate): string {
  const openHigh = p.risks.filter((r) => r.status !== 'closed' && riskScore(r) >= 10).length
  if (a.health.label === 'Completed') {
    const late = a.eIdx - a.targetIdx
    return `${p.name} is complete: all ${plural(a.leaves.length, 'task')} are finished. The plan ended on ${fmtLong(a.end)}, ${
      late > 0 ? `${plural(late, 'working day')} after` : late < 0 ? `${plural(-late, 'working day')} ahead of` : 'in line with'
    } the target of ${fmtLong(p.targetEnd)}. ${openHigh ? `${plural(openHigh, 'high-severity risk')} remain open in the register.` : 'No high-severity risks remain open.'}`
  }
  const pace =
    a.slipDays > 0
      ? `${plural(a.slipDays, 'working day')} after`
      : a.slipDays < 0
        ? `${plural(-a.slipDays, 'working day')} ahead of`
        : 'in line with'
  const lateCritical = a.overdue.filter((r) => r.critical).length
  const overdue = a.overdue.length
    ? `${plural(a.overdue.length, 'task')} ${a.overdue.length === 1 ? 'is' : 'are'} overdue${lateCritical ? ` (${lateCritical} on the critical path)` : ''}`
    : 'No tasks are overdue'
  return (
    `${p.name} is ${a.percent}% complete against ${a.planned}% planned as of ${fmtLong(today)}, and is rated ${a.health.label.toLowerCase()} with a health score of ${a.health.score}/100. ` +
    `The schedule finishes on ${fmtLong(a.end)}; at the current pace the forecast finish is ${fmtLong(a.forecastEnd)}, ${pace} the target of ${fmtLong(p.targetEnd)}. ` +
    `${overdue}, and ${openHigh ? `${plural(openHigh, 'open risk')} ${openHigh === 1 ? 'is' : 'are'} rated high or critical` : 'no open risks are rated high or critical'}.`
  )
}

export function buildReport(p: Project, today: ISODate = todayISO()): ReportData {
  const a = analyze(p, today)
  const open = p.risks.filter((r) => r.status !== 'closed')
  const risks: ReportRisk[] = [...open]
    .sort((x, y) => riskScore(y) - riskScore(x))
    .slice(0, 5)
    .map((risk) => ({ risk, score: riskScore(risk), severity: severityOf(riskScore(risk)), owner: ownerName(p, risk.ownerId) }))

  // Recommended actions, most severe first, without saying the same thing twice.
  const recs = riskRecommendations(p, today)
  const actions: ReportAction[] = recs.map((r) => ({ title: r.title, detail: r.action }))
  const coveredTasks = new Set(recs.map((r) => r.taskId).filter(Boolean))
  const hasRegisterRec = recs.some((r) => r.id === 'unmitigated')
  for (const i of projectInsights(p, today).improvements) {
    if (i.taskId && coveredTasks.has(i.taskId)) continue
    if (hasRegisterRec && i.id.endsWith('-risks')) continue
    if (actions.some((x) => x.title === i.title)) continue
    actions.push({ title: i.title, detail: i.detail })
  }

  return {
    today,
    a,
    summary: summaryText(p, a, today),
    budget: budgetView(p, a),
    phases: a.phases,
    milestones: [...a.milestones].sort((x, y) => x.eIdx - y.eIdx),
    risks,
    openRisks: open.length,
    actions: actions.slice(0, 6),
  }
}

export function tasksCsv(p: Project, today: ISODate = todayISO()): string {
  const a = analyze(p, today)
  const head = ['WBS', 'Name', 'Type', 'Owner', 'Start', 'End', 'Working days', 'Status', 'Progress %', 'Priority', 'Critical', 'Slack (days)', 'Predecessors']
  const rows = a.rows.map((r) => [
    r.code,
    r.task.name,
    r.depth === 0 ? 'Phase' : r.isSummary ? 'Summary' : r.task.milestone ? 'Milestone' : 'Task',
    r.isSummary ? '' : ownerName(p, r.task.ownerId),
    r.start,
    r.end,
    r.duration,
    STATUS_LABEL[r.status],
    r.progress,
    r.isSummary ? '' : PRIORITY_LABEL[r.task.priority],
    r.critical ? 'Yes' : 'No',
    r.slack,
    r.isSummary
      ? r.task.dependencies.map((d) => a.byId.get(d)?.code).filter(Boolean).join(' ')
      : r.preds.map((x) => a.byId.get(x)!.code).join(' '),
  ])
  return toCSV([head, ...rows])
}

export function risksCsv(p: Project): string {
  const head = ['Risk ID', 'Description', 'Category', 'Probability', 'Impact', 'Score', 'Severity', 'Owner', 'Mitigation', 'Status']
  const rows = [...p.risks]
    .sort((x, y) => riskScore(y) - riskScore(x))
    .map((r) => [r.code, r.description, r.category, r.probability, r.impact, riskScore(r), severityOf(riskScore(r)), ownerName(p, r.ownerId), r.mitigation, RISK_STATUS_LABEL[r.status]])
  return toCSV([head, ...rows])
}
