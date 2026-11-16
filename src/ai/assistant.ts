import type { Project } from '../types'
import { STATUS_LABEL } from '../types'
import { fmtLong, fmtShort, fromWIdx, relativeDay, todayISO } from '../lib/dates'
import { fmtMoney, plural } from '../lib/format'
import { riskScore, severityOf } from '../lib/risk'
import { analyze, type Analysis, type Row } from '../lib/schedule'
import { blockers, downstreamCount, riskRecommendations, workload } from './insights'

/**
 * Rule-based project assistant. It recognises the intent of a question and answers from the
 * current project's live data. Used when no LLM is configured, and as the fallback when a
 * Claude request fails.
 *
 * Answers use a tiny markdown subset: **bold** and "- " bullets.
 */

export const SUGGESTED_QUESTIONS = [
  'What are the biggest risks in this project?',
  'Which tasks are on the critical path?',
  'Are we likely to miss our deadline?',
  'What should the team prioritize this week?',
  'Which tasks are blocking project completion?',
  'How can we reduce the project duration?',
]

const owner = (p: Project, r: Row) => p.resources.find((x) => x.id === r.task.ownerId)?.name ?? 'unassigned'
const line = (p: Project, r: Row, extra = '') => `- **${r.code} ${r.task.name}** — ${owner(p, r)}, ${fmtShort(r.start)} to ${fmtShort(r.end)}${extra}`

type Handler = (p: Project, a: Analysis, q: string) => string

const risks: Handler = (p, a) => {
  const open = p.risks.filter((r) => r.status !== 'closed').sort((x, y) => riskScore(y) - riskScore(x))
  const recs = riskRecommendations(p).filter((r) => r.severity === 'Critical' || r.severity === 'High')
  const out: string[] = []
  if (open.length) {
    out.push(`The register has **${plural(open.length, 'open risk')}**. The highest scoring are:`)
    for (const r of open.slice(0, 3)) {
      out.push(`- **${r.code}** (${severityOf(riskScore(r))}, score ${riskScore(r)} = ${r.probability} × ${r.impact}): ${r.description}. Mitigation: ${r.mitigation || 'none recorded yet'}`)
    }
  } else out.push('There are no open risks in the register.')
  if (recs.length) {
    out.push('', 'From the schedule itself I also see:')
    for (const r of recs.slice(0, 3)) out.push(`- **${r.title}.** ${r.detail}`)
  }
  if (!recs.length && a.health.label === 'On Track') out.push('', `The schedule is not adding risk right now: health is ${a.health.score}/100 and nothing on the critical path is overdue.`)
  return out.join('\n')
}

const criticalPath: Handler = (p, a) => {
  const path = a.critical.filter((r) => r.status !== 'done').sort((x, y) => x.sIdx - y.sIdx)
  if (!path.length) return 'Every critical-path task is complete.'
  const days = path.reduce((s, r) => s + r.task.duration, 0)
  const out = [
    `**${plural(path.length, 'remaining task')}** (${days} working days) have zero slack, so any delay to them moves the finish date of ${fmtLong(a.end)}:`,
  ]
  for (const r of path.slice(0, 10)) out.push(line(p, r, r.overdue ? ' — **overdue**' : r.status === 'in_progress' ? ` — ${r.progress}% done` : ''))
  if (path.length > 10) out.push(`- …and ${path.length - 10} more. Turn on "Critical path" in the Gantt timeline to see all of them.`)
  const done = a.critical.length - path.length
  if (done) out.push('', `${plural(done, 'critical task')} already finished.`)
  return out.join('\n')
}

const deadline: Handler = (p, a) => {
  if (a.health.label === 'Completed') return `The project is complete. It finished on ${fmtLong(a.end)} against a target of ${fmtLong(p.targetEnd)}.`
  const out: string[] = []
  const scheduledSlip = a.eIdx - a.targetIdx
  if (a.slipDays > 0) {
    out.push(`**Yes, at the current pace the deadline is at risk.** The forecast finish is **${fmtLong(a.forecastEnd)}**, ${plural(a.slipDays, 'working day')} after the target of ${fmtLong(p.targetEnd)}.`)
  } else if (a.slipDays > -3) {
    out.push(`**It is tight.** The forecast finish is ${fmtLong(a.forecastEnd)}, ${a.slipDays === 0 ? 'exactly on' : `${plural(-a.slipDays, 'working day')} before`} the target of ${fmtLong(p.targetEnd)}, so there is almost no buffer.`)
  } else {
    out.push(`**Unlikely.** The forecast finish is ${fmtLong(a.forecastEnd)}, ${plural(-a.slipDays, 'working day')} ahead of the target of ${fmtLong(p.targetEnd)}.`)
  }
  out.push('', 'What that is based on:')
  out.push(`- Progress is **${a.percent}%** against **${a.planned}%** planned by today (SPI ${a.spi.toFixed(2)}), which is ${a.varianceDays > 0 ? `about ${plural(a.varianceDays, 'working day')} behind` : a.varianceDays < 0 ? `about ${plural(-a.varianceDays, 'working day')} ahead` : 'on plan'}.`)
  out.push(`- The schedule as planned ends ${fmtShort(a.end)}${scheduledSlip > 0 ? `, already ${plural(scheduledSlip, 'working day')} past the target` : ''}.`)
  const late = a.overdue.filter((r) => r.critical)
  if (late.length) out.push(`- ${plural(late.length, 'critical-path task')} overdue, led by ${late[0].code} ${late[0].task.name}.`)
  else if (a.overdue.length) out.push(`- ${plural(a.overdue.length, 'task')} overdue, none on the critical path.`)
  if (a.slipDays > 0) out.push('', 'Ask me "How can we reduce the project duration?" for recovery options.')
  return out.join('\n')
}

const priorities: Handler = (p, a) => {
  const weekEnd = Math.floor(a.todayIdx / 5) * 5 + 4
  const open = a.leaves.filter((r) => r.status !== 'done')
  const late = open.filter((r) => r.overdue).sort((x, y) => Number(y.critical) - Number(x.critical) || x.eIdx - y.eIdx)
  const active = open.filter((r) => !r.overdue && (r.status === 'in_progress' || r.status === 'review')).sort((x, y) => Number(y.critical) - Number(x.critical) || x.eIdx - y.eIdx)
  const starting = open.filter((r) => !r.overdue && (r.status === 'todo' || r.status === 'backlog') && r.sIdx <= weekEnd).sort((x, y) => Number(y.critical) - Number(x.critical) || x.sIdx - y.sIdx)
  if (!late.length && !active.length && !starting.length) return 'Nothing is scheduled for this week. The next task starts ' + (open[0] ? `${fmtShort(open.sort((x, y) => x.sIdx - y.sIdx)[0].start)}.` : 'after the project ends.')
  const out = [`For the week ending ${fmtShort(fromWIdx(weekEnd))}, in this order:`]
  if (late.length) {
    out.push('', '**1. Finish overdue work**')
    for (const r of late.slice(0, 4)) out.push(line(p, r, ` — ${r.progress}% done${r.critical ? ', on the critical path' : ''}`))
  }
  if (active.length) {
    out.push('', `**${late.length ? 2 : 1}. Keep in-progress work moving**`)
    for (const r of active.slice(0, 4)) out.push(line(p, r, ` — ${r.progress}% done${r.critical ? ', critical' : ''}`))
  }
  if (starting.length) {
    out.push('', `**${[late, active].filter((x) => x.length).length + 1}. Start on time**`)
    for (const r of starting.slice(0, 4)) {
      const waiting = r.preds.filter((x) => a.byId.get(x)!.status !== 'done')
      out.push(line(p, r, waiting.length ? ` — waiting on ${a.byId.get(waiting[0])!.code}` : r.critical ? ' — critical' : ''))
    }
  }
  return out.join('\n')
}

const blocking: Handler = (p, a) => {
  const list = blockers(a)
  if (!list.length) return 'Nothing is blocked right now: every task that should have started has its predecessors complete.'
  const out = [`**${plural(list.length, 'unfinished task')}** ${list.length === 1 ? 'is' : 'are'} holding up other work. Ranked by how much sits behind them:`]
  for (const b of list.slice(0, 6)) {
    const next = b.row.succs.map((s) => a.byId.get(s)!).filter((s) => s.status !== 'done').slice(0, 2).map((s) => s.code)
    out.push(line(p, b.row, ` — ${b.row.progress}% done${b.late ? ', **overdue**' : ''}; blocks ${plural(b.waiting, 'task')} (next: ${next.join(', ')})`))
  }
  const last = a.leaves.filter((r) => !r.succs.length && r.status !== 'done').sort((x, y) => y.eIdx - x.eIdx)[0]
  if (last) out.push('', `Project completion itself is gated by **${last.code} ${last.task.name}**, due ${fmtShort(last.end)}.`)
  return out.join('\n')
}

const shorten: Handler = (p, a) => {
  const path = a.critical.filter((r) => r.status !== 'done' && r.task.duration > 0).sort((x, y) => y.task.duration - x.task.duration)
  if (!path.length) return 'There is no remaining critical work to shorten.'
  const out = ['The finish date only moves if the critical path gets shorter. Options, largest effect first:']
  const big = path.slice(0, 3)
  out.push('', '**Add capacity to the longest critical tasks (crashing)**')
  for (const r of big) out.push(line(p, r, ` — ${r.task.duration} days; a second owner or a split into parallel subtasks could save ${Math.max(1, Math.round(r.task.duration * 0.3))}–${Math.max(1, Math.round(r.task.duration * 0.5))} days`))

  // Fast-tracking: critical finish-to-start pairs owned by different people can overlap.
  const pairs: string[] = []
  for (const r of path) {
    for (const pid of r.preds) {
      const pred = a.byId.get(pid)!
      if (pred.critical && pred.status !== 'done' && pred.task.duration >= 3 && pred.task.ownerId !== r.task.ownerId) {
        pairs.push(`- Start **${r.code} ${r.task.name}** before **${pred.code} ${pred.task.name}** is fully finished (overlap the last ${Math.max(1, Math.round(pred.task.duration / 3))} days against a draft or agreed interface).`)
      }
    }
  }
  if (pairs.length) out.push('', '**Overlap sequential work (fast-tracking)**', ...pairs.slice(0, 3))

  const near = a.leaves.filter((r) => r.status !== 'done' && !r.critical && r.slack <= 2 && r.task.duration > 0)
  out.push('', '**Protect what you gain**')
  out.push(`- ${near.length ? `${plural(near.length, 'task')} have 2 days of slack or less and become critical as soon as the path shortens — watch ${near.slice(0, 2).map((r) => r.code).join(' and ')}.` : 'Other tasks have enough slack that shortening the critical path will bring the finish date forward directly.'}`)
  const over = workload(p, a).filter((l) => l.overWeeks.length)
  if (over.length) out.push(`- ${over.map((l) => l.resource.name).slice(0, 2).join(' and ')} ${over.length === 1 ? 'is' : 'are'} already over-allocated, so add people rather than hours.`)
  out.push('- Deferring low-priority scope to after launch shortens the schedule without adding risk.')
  return out.join('\n')
}

const budget: Handler = (p, a) => {
  if (p.budget == null) return 'This project has no budget set. Add one under Settings → Project to track cost performance.'
  const ev = (p.budget * a.percent) / 100
  const pv = (p.budget * a.planned) / 100
  const cpi = p.spent > 0 ? ev / p.spent : 1
  const eac = cpi > 0 ? p.budget / cpi : p.budget
  return [
    `Budget is **${fmtMoney(p.budget)}** and **${fmtMoney(p.spent)}** has been spent (${Math.round((p.spent / p.budget) * 100)}%).`,
    '',
    `- Earned value: ${fmtMoney(ev)} for ${a.percent}% complete`,
    `- Planned value: ${fmtMoney(pv)} for ${a.planned}% planned`,
    `- Cost performance index: **${cpi.toFixed(2)}** (${cpi >= 1 ? 'on or under budget' : 'over budget for the work done'})`,
    `- Estimate at completion: **${fmtMoney(eac)}**, ${eac > p.budget ? `${fmtMoney(eac - p.budget)} over` : `${fmtMoney(p.budget - eac)} under`} budget if this efficiency continues`,
  ].join('\n')
}

const team: Handler = (p, a) => {
  const loads = workload(p, a).filter((l) => l.openCount).sort((x, y) => y.remainingDays - x.remainingDays)
  if (!loads.length) return 'No open tasks are assigned to anyone.'
  const out = ['Remaining work by person:']
  for (const l of loads.slice(0, 8)) {
    out.push(`- **${l.resource.name}** (${l.resource.role}) — ${plural(l.openCount, 'open task')}, ${l.remainingDays} days left${l.overWeeks.length ? `; **over-allocated** in the week of ${fmtShort(l.overWeeks[0].start)} (${l.overWeeks[0].load} days vs ${l.capacity} capacity)` : ''}`)
  }
  const unowned = a.leaves.filter((r) => r.status !== 'done' && !r.task.ownerId).length
  if (unowned) out.push('', `${plural(unowned, 'open task')} ${unowned === 1 ? 'has' : 'have'} no owner.`)
  return out.join('\n')
}

const milestones: Handler = (_p, a) => {
  if (!a.milestones.length) return 'No milestones are defined. Mark a task as a milestone in the WBS Builder.'
  const next = a.milestones.filter((m) => m.status !== 'done').sort((x, y) => x.eIdx - y.eIdx)
  const out = [`${a.milestones.length - next.length} of ${a.milestones.length} milestones are complete.`]
  if (next.length) {
    out.push('', 'Coming up:')
    for (const m of next.slice(0, 6)) out.push(`- **${m.task.name}** — ${fmtShort(m.end)} (${relativeDay(m.end)})${m.overdue ? ', **overdue**' : ''}`)
  }
  return out.join('\n')
}

const overdue: Handler = (p, a) => {
  if (!a.overdue.length) return 'No tasks are overdue.'
  const out = [`**${plural(a.overdue.length, 'task')}** ${a.overdue.length === 1 ? 'is' : 'are'} past the planned finish:`]
  for (const r of a.overdue.sort((x, y) => x.eIdx - y.eIdx).slice(0, 8)) {
    out.push(line(p, r, ` — ${STATUS_LABEL[r.status]}, ${r.progress}% done, ${plural(a.todayIdx - r.eIdx, 'working day')} late${r.critical ? ', critical' : ''}`))
  }
  return out.join('\n')
}

const summary: Handler = (p, a) => {
  const openRisks = p.risks.filter((r) => r.status !== 'closed')
  return [
    `**${p.name}** is **${a.health.label.toLowerCase()}** with a health score of ${a.health.score}/100.`,
    '',
    `- Progress: ${a.percent}% complete against ${a.planned}% planned`,
    `- Tasks: ${a.counts.done} of ${a.leaves.length} completed, ${a.counts.in_progress + a.counts.review} in progress, ${a.overdue.length} overdue`,
    `- Schedule: planned finish ${fmtLong(a.end)}, forecast ${fmtLong(a.forecastEnd)}, target ${fmtLong(p.targetEnd)}`,
    `- Risks: ${openRisks.length} open, ${openRisks.filter((r) => riskScore(r) >= 10).length} of them high or critical`,
    ...(p.budget != null ? [`- Budget: ${fmtMoney(p.spent)} spent of ${fmtMoney(p.budget)}`] : []),
  ].join('\n')
}

function taskLookup(p: Project, a: Analysis, q: string): string | null {
  const code = q.match(/\b\d+(?:\.\d+)+\b/)?.[0]
  let row = code ? a.rows.find((r) => r.code === code) : undefined
  if (!row) {
    const text = q.toLowerCase()
    row = a.rows
      .filter((r) => r.task.name.length >= 6 && text.includes(r.task.name.toLowerCase()))
      .sort((x, y) => y.task.name.length - x.task.name.length)[0]
  }
  if (!row) return null
  const preds = row.isSummary ? [] : row.preds.map((x) => a.byId.get(x)!)
  return [
    `**${row.code} ${row.task.name}**${row.isSummary ? ' (summary)' : ''}`,
    '',
    `- Status: ${STATUS_LABEL[row.status]}, ${row.progress}% complete${row.overdue ? ' — **overdue**' : ''}`,
    `- Dates: ${fmtLong(row.start)} to ${fmtLong(row.end)} (${plural(row.duration, 'working day')})`,
    ...(row.isSummary ? [] : [`- Owner: ${owner(p, row)}`]),
    `- ${row.critical ? 'On the critical path (no slack)' : `${plural(row.slack, 'day')} of slack`}`,
    ...(preds.length ? [`- Depends on: ${preds.map((x) => `${x.code} (${STATUS_LABEL[x.status]})`).join(', ')}`] : []),
    ...(!row.isSummary && row.succs.length ? [`- ${plural(downstreamCount(a, row.id), 'unfinished task')} downstream`] : []),
  ].join('\n')
}

const INTENTS: [RegExp, Handler][] = [
  [/critical path|critical task|zero slack|no slack|float/i, criticalPath],
  [/block|bottleneck|holding up|waiting on|stuck/i, blocking],
  [/reduce|shorten|faster|speed up|compress|crash|fast.?track|save time|earlier/i, shorten],
  [/priorit|this week|focus|work on (next|first)|what next|next steps?/i, priorities],
  [/deadline|on time|miss|slip|finish|forecast|complete by|when will/i, deadline],
  [/overdue|delayed|late|behind/i, overdue],
  [/risk|threat|concern|worr/i, risks],
  [/budget|cost|spend|spent|money|cpi/i, budget],
  [/overload|workload|capacity|resource|team|who is|who's|alloc/i, team],
  [/milestone/i, milestones],
  [/status|summary|overview|progress|health|how are we|how is/i, summary],
]

export function answer(question: string, p: Project): string {
  const a = analyze(p, todayISO())
  const q = question.trim()
  if (!a.leaves.length) return 'This project has no tasks yet. Add some in the WBS Builder, or generate a plan with the AI Project Generator.'
  // A WBS code in the question means it is about that task, whatever other words it uses.
  const task = taskLookup(p, a, q)
  if (task && /\b\d+\.\d+/.test(q)) return task
  for (const [pattern, handler] of INTENTS) if (pattern.test(q)) return handler(p, a, q)
  if (task) return task
  return [
    'I answer from this project’s tasks, dates, dependencies, owners, risks and budget. Try one of these:',
    '',
    ...SUGGESTED_QUESTIONS.map((s) => `- ${s}`),
    '- Who is over-allocated?',
    '- How is the budget tracking?',
    '- Tell me about task 5.2',
  ].join('\n')
}
