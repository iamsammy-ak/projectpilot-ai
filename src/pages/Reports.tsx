import { CircleCheck, Clock, FileDown, FileSpreadsheet, LoaderCircle, Printer, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { NoProject } from '../components/NoProject'
import { Badge, Button, Card, cx, HealthBadge, PageHeader, Progress, SeverityBadge, SourceBadge, StatusPill } from '../components/ui'
import { fmtLong, fmtShort, fromWIdx, relativeDay } from '../lib/dates'
import { download, fmtMoney, fmtMoneyCompact, plural, slug } from '../lib/format'
import { exportReportPdf } from '../lib/pdf'
import { buildReport, risksCsv, tasksCsv, type BudgetView, type ReportData } from '../lib/report'
import { progressCurve } from '../lib/schedule'
import { useApp, useProject } from '../store'
import { CHART } from '../theme'
import type { Project } from '../types'
import { PROJECT_TYPE_LABEL, RISK_STATUS_LABEL } from '../types'

export default function Reports() {
  const project = useProject()
  if (!project) return <NoProject />
  return <ReportPage project={project} />
}

const TH = 'px-3 py-2 text-left text-xs font-medium text-ink-500'
const TD = 'px-3 py-2 align-top'

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="mt-7 border-t border-line-soft pt-6 break-inside-avoid-page">
      <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
      {hint && <p className="mt-0.5 text-[13px] text-ink-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function ReportPage({ project }: { project: Project }) {
  const toast = useApp((s) => s.toast)
  const [exporting, setExporting] = useState(false)
  const report = useMemo(() => buildReport(project), [project])
  const { a } = report

  const exportPdf = async () => {
    setExporting(true)
    try {
      await exportReportPdf(project)
      toast('Report exported as PDF')
    } catch (e) {
      toast(`The PDF could not be created: ${e instanceof Error ? e.message : 'unknown error'}`, 'error')
    } finally {
      setExporting(false)
    }
  }
  const csv = (kind: 'tasks' | 'risks') => {
    download(`${slug(project.name)}-${kind}.csv`, kind === 'tasks' ? tasksCsv(project) : risksCsv(project), 'text/csv;charset=utf-8')
    toast(kind === 'tasks' ? 'Task list exported' : 'Risk register exported')
  }

  const variance =
    a.varianceDays > 0
      ? { value: plural(a.varianceDays, 'day'), note: 'behind plan', bad: true }
      : a.varianceDays < 0
        ? { value: plural(-a.varianceDays, 'day'), note: 'ahead of plan', bad: false }
        : { value: '0 days', note: 'on plan', bad: false }
  const kpis: { label: string; value: string; note: string; bad?: boolean }[] = [
    { label: 'Completion', value: `${a.percent}%`, note: `${a.planned}% planned by today` },
    { label: 'Schedule performance (SPI)', value: a.spi.toFixed(2), note: a.spi >= 1 ? 'on or ahead of plan' : 'behind plan', bad: a.spi < 0.9 },
    { label: 'Schedule variance', value: variance.value, note: variance.note, bad: variance.bad },
    {
      label: 'Forecast finish',
      value: fmtShort(a.forecastEnd),
      note: a.slipDays > 0 ? `${plural(a.slipDays, 'day')} after target` : a.slipDays < 0 ? `${plural(-a.slipDays, 'day')} before target` : 'on target',
      bad: a.slipDays > 0,
    },
    project.budget != null
      ? { label: 'Budget spent', value: fmtMoneyCompact(project.spent), note: `of ${fmtMoneyCompact(project.budget)} (${Math.round((project.spent / project.budget) * 100)}%)`, bad: project.spent > project.budget }
      : { label: 'Budget spent', value: '–', note: 'no budget set' },
  ]

  return (
    <>
      <PageHeader
        title="Reports"
        description="An executive status report built from the live plan. Export it as a PDF for stakeholders, or take the underlying data as CSV."
        actions={
          <>
            <Button icon={<FileSpreadsheet size={15} />} onClick={() => csv('tasks')}>
              Tasks CSV
            </Button>
            <Button icon={<FileSpreadsheet size={15} />} onClick={() => csv('risks')} disabled={!project.risks.length}>
              Risks CSV
            </Button>
            <Button icon={<Printer size={15} />} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="primary" icon={exporting ? <LoaderCircle size={15} className="animate-spin" /> : <FileDown size={15} />} onClick={exportPdf} disabled={exporting}>
              {exporting ? 'Preparing PDF' : 'Export PDF'}
            </Button>
          </>
        }
      />

      <Card className="print-sheet mx-auto max-w-[1000px] px-6 py-7 sm:px-9 sm:py-8">
        {/* Title block */}
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-[13px] text-ink-500">Status report, {fmtLong(report.today)}</p>
            <h1 className="mt-1 text-2xl leading-tight font-semibold tracking-tight text-ink-900">{project.name}</h1>
            <p className="mt-1.5 text-[13px] text-ink-500">
              {PROJECT_TYPE_LABEL[project.type]}, {fmtLong(a.start)} to {fmtLong(a.end)}, team of {project.resources.length || project.teamSize}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={project.source} />
            <HealthBadge label={a.health.label} />
            <span className="tnum text-[13px] text-ink-500">Health {a.health.score}/100</span>
          </div>
        </header>

        {/* Summary */}
        <Section title="Project summary">
          <p className="max-w-[78ch] leading-relaxed text-ink-700">{report.summary}</p>
          <dl className="mt-5 grid grid-cols-2 gap-y-4 rounded-xl border border-line sm:grid-cols-3 lg:grid-cols-5">
            {kpis.map((k, i) => (
              <div key={k.label} className={cx('px-4 py-3', i > 0 && 'lg:border-l lg:border-line-soft')}>
                <dt className="text-xs text-ink-500">{k.label}</dt>
                <dd className="mt-0.5 text-xl leading-tight font-semibold text-ink-900">{k.value}</dd>
                <dd className={cx('flex items-center gap-1 text-xs', k.bad ? 'text-red-700' : 'text-ink-500')}>
                  {k.bad && <TriangleAlert size={11} />}
                  {k.note}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Schedule */}
        <Section title="Schedule performance" hint="Cumulative progress the plan expects against progress earned so far, weighted by task duration.">
          <Curve report={report} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className={cx(TH, 'w-14')}>WBS</th>
                  <th className={TH}>Phase</th>
                  <th className={cx(TH, 'w-40')}>Dates</th>
                  <th className={cx(TH, 'w-44')}>Progress</th>
                  <th className={cx(TH, 'w-32')}>Status</th>
                </tr>
              </thead>
              <tbody>
                {report.phases.map((ph) => (
                  <tr key={ph.id} className="border-b border-line-soft last:border-0">
                    <td className={cx(TD, 'tnum text-ink-500')}>{ph.code}</td>
                    <td className={cx(TD, 'font-medium text-ink-900')}>
                      {ph.task.name}
                      {ph.overdue && (
                        <Badge tone="red" icon={<TriangleAlert size={11} />} className="ml-2 align-middle">
                          Overdue
                        </Badge>
                      )}
                    </td>
                    <td className={cx(TD, 'tnum whitespace-nowrap text-ink-600')}>
                      {fmtShort(ph.start)} – {fmtShort(ph.end)}
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-2.5">
                        <Progress value={ph.progress} tone={ph.status === 'done' ? 'green' : ph.overdue ? 'red' : 'brand'} className="flex-1" />
                        <span className="tnum w-9 text-right text-ink-700">{ph.progress}%</span>
                      </div>
                    </td>
                    <td className={TD}>
                      <StatusPill status={ph.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Budget */}
        <Section title="Budget overview" hint={report.budget ? 'Earned-value figures derived from the budget, actual spend and progress to date.' : undefined}>
          {report.budget ? (
            <BudgetTable b={report.budget} percent={a.percent} planned={a.planned} />
          ) : (
            <p className="rounded-lg bg-canvas px-4 py-3 text-ink-600">
              No budget has been set for this project, so cost performance cannot be reported. Add a budget under Settings to see planned value, earned value and the forecast cost at completion.
            </p>
          )}
        </Section>

        {/* Milestones */}
        <Section title="Major milestones" hint={report.milestones.length ? `${report.milestones.filter((m) => m.status === 'done').length} of ${report.milestones.length} reached.` : undefined}>
          {report.milestones.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className={cx(TH, 'w-14')}>WBS</th>
                    <th className={TH}>Milestone</th>
                    <th className={cx(TH, 'w-32')}>Date</th>
                    <th className={cx(TH, 'w-28')}>Status</th>
                    <th className={cx(TH, 'w-28')}>Timing</th>
                  </tr>
                </thead>
                <tbody>
                  {report.milestones.map((m) => (
                    <tr key={m.id} className="border-b border-line-soft last:border-0">
                      <td className={cx(TD, 'tnum text-ink-500')}>{m.code}</td>
                      <td className={cx(TD, 'font-medium text-ink-900')}>
                        <span className="mr-2 inline-block h-2 w-2 rotate-45 bg-brand-500 align-middle" aria-hidden />
                        {m.task.name}
                      </td>
                      <td className={cx(TD, 'tnum whitespace-nowrap text-ink-600')}>{fmtLong(m.end)}</td>
                      <td className={TD}>
                        {m.status === 'done' ? (
                          <Badge tone="green" icon={<CircleCheck size={12} />}>
                            Reached
                          </Badge>
                        ) : m.overdue ? (
                          <Badge tone="red" icon={<TriangleAlert size={12} />}>
                            Overdue
                          </Badge>
                        ) : (
                          <Badge icon={<Clock size={12} />}>Upcoming</Badge>
                        )}
                      </td>
                      <td className={cx(TD, 'whitespace-nowrap text-ink-500')}>{m.status === 'done' ? '' : relativeDay(m.end, report.today)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-ink-500">No milestones are defined. Mark a task as a milestone in the WBS Builder to track it here.</p>
          )}
        </Section>

        {/* Risks */}
        <Section
          title="Project risks"
          hint={report.risks.length ? `The ${report.risks.length} highest-scoring of ${plural(report.openRisks, 'open risk')}. Risk score = Probability × Impact.` : undefined}
        >
          {report.risks.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-line">
                    <th className={cx(TH, 'w-16')}>ID</th>
                    <th className={TH}>Risk</th>
                    <th className={cx(TH, 'w-28')}>Severity</th>
                    <th className={cx(TH, 'w-32')}>Owner</th>
                    <th className={cx(TH, 'w-24')}>Status</th>
                    <th className={TH}>Mitigation</th>
                  </tr>
                </thead>
                <tbody>
                  {report.risks.map((x) => (
                    <tr key={x.risk.id} className="border-b border-line-soft last:border-0">
                      <td className={cx(TD, 'tnum font-semibold text-ink-900')}>{x.risk.code}</td>
                      <td className={cx(TD, 'text-ink-900')}>{x.risk.description}</td>
                      <td className={TD}>
                        <SeverityBadge severity={x.severity} score={x.score} />
                      </td>
                      <td className={cx(TD, 'text-ink-600')}>{x.owner}</td>
                      <td className={cx(TD, 'text-ink-600')}>{RISK_STATUS_LABEL[x.risk.status]}</td>
                      <td className={cx(TD, 'text-ink-600')}>{x.risk.mitigation || 'None recorded'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-ink-500">There are no open risks in the register.</p>
          )}
        </Section>

        {/* Actions */}
        <Section title="Recommended actions" hint={report.actions.length ? 'In priority order, from analysis of the schedule, workload and risk register.' : undefined}>
          {report.actions.length ? (
            <ol className="space-y-3">
              {report.actions.map((act, i) => (
                <li key={act.title} className="flex gap-3">
                  <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{act.title}</p>
                    <p className="max-w-[78ch] text-[13px] text-ink-600">{act.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-ink-500">No actions are outstanding.</p>
          )}
        </Section>
      </Card>
    </>
  )
}

/* ───────────────────────────── S-curve ───────────────────────────── */

interface TipProps {
  active?: boolean
  label?: unknown
  payload?: readonly { name?: unknown; value?: unknown; color?: string }[]
}

function CurveTip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length || typeof label !== 'number') return null
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-ink-900">{fmtLong(fromWIdx(label))}</p>
      {payload.map((p) =>
        p.value == null ? null : (
          <p key={String(p.name)} className="flex items-center gap-2 text-ink-600">
            <span className="h-0.5 w-3 rounded-full" style={{ background: p.color }} />
            {String(p.name)}
            <span className="tnum ml-auto pl-3 font-medium text-ink-900">{String(p.value)}%</span>
          </p>
        ),
      )}
    </div>
  )
}

function Curve({ report }: { report: ReportData }) {
  const { a } = report
  const data = useMemo(() => progressCurve(a), [a])
  const showToday = a.todayIdx >= a.sIdx && a.todayIdx <= a.eIdx + 1
  if (data.length < 2) return <p className="text-ink-500">Add tasks to the plan to see the progress curve.</p>
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="idx"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(i: number) => fmtShort(fromWIdx(i))}
            tick={{ fill: CHART.axis, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            minTickGap={36}
          />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={42} />
          <Tooltip content={<CurveTip />} cursor={{ stroke: CHART.axis, strokeWidth: 1 }} />
          <Legend verticalAlign="top" align="right" height={28} iconType="plainline" formatter={(value: string) => <span className="text-xs text-ink-600">{value}</span>} />
          {showToday && <ReferenceLine x={a.todayIdx} stroke={CHART.axis} strokeWidth={1} label={{ value: 'Today', position: 'insideTopLeft', fill: CHART.axis, fontSize: 11 }} />}
          <Line type="monotone" dataKey="planned" name="Planned" stroke={CHART.planned} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="actual" name="Actual" stroke={CHART.actual} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ───────────────────────────── Budget ───────────────────────────── */

function BudgetTable({ b, percent, planned }: { b: BudgetView; percent: number; planned: number }) {
  const over = b.variance < 0
  const rows: { label: string; value: string; note: string; strong?: boolean; bad?: boolean }[] = [
    { label: 'Budget at completion (BAC)', value: fmtMoney(b.bac), note: 'Approved total budget' },
    { label: 'Planned value (PV)', value: fmtMoney(b.pv), note: `Budget for the ${planned}% of work scheduled by today` },
    { label: 'Earned value (EV)', value: fmtMoney(b.ev), note: `Budget for the ${percent}% of work actually completed` },
    { label: 'Actual cost (AC)', value: fmtMoney(b.ac), note: `${Math.round((b.ac / (b.bac || 1)) * 100)}% of the budget spent to date` },
    {
      label: 'Cost performance index (CPI)',
      value: b.cpi == null ? 'n/a' : b.cpi.toFixed(2),
      note: b.cpi == null ? 'Nothing has been spent yet' : b.cpi >= 1 ? 'On or under budget for the work done' : 'Over budget for the work done',
      bad: b.cpi != null && b.cpi < 1,
    },
    { label: 'Estimate at completion (EAC)', value: fmtMoney(b.eac), note: 'Expected total cost if cost efficiency stays the same', strong: true },
    { label: 'Variance at completion', value: `${over ? '−' : ''}${fmtMoney(Math.abs(b.variance))}`, note: over ? 'Forecast overrun against the budget' : 'Forecast to finish within the budget', strong: true, bad: over },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>Measure</th>
            <th className={cx(TH, 'w-36 text-right')}>Amount</th>
            <th className={TH}>What it means</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line-soft last:border-0">
              <td className={cx(TD, r.strong ? 'font-semibold text-ink-900' : 'text-ink-700')}>{r.label}</td>
              <td className={cx(TD, 'tnum text-right text-ink-900', r.strong && 'font-semibold')}>{r.value}</td>
              <td className={cx(TD, r.bad ? 'text-red-700' : 'text-ink-500')}>
                {r.bad && <TriangleAlert size={12} className="mr-1 inline align-[-2px]" />}
                {r.note}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
