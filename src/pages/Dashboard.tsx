import { ArrowRight, CalendarClock, CircleAlert, CircleCheck, Cpu, Diamond, Flag, FolderKanban, Info, Lightbulb, ListChecks, ShieldAlert, Sparkles, TriangleAlert, Users } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { portfolioInsights, type Insight, type Tone } from '../ai/insights'
import { Button, Card, CardHeader, cx, Empty, HealthBadge, Owner, PageHeader, Progress, Segmented, StatusPill } from '../components/ui'
import { fmtLong, fmtShort, fromWIdx, relativeDay, timeAgo, todayISO } from '../lib/dates'
import { plural } from '../lib/format'
import { riskScore } from '../lib/risk'
import { analyze, type Analysis, type HealthLabel, type Row } from '../lib/schedule'
import { navigate, type Route } from '../router'
import { useApp, useProject } from '../store'
import { CHART, STATUS_COLOR } from '../theme'
import { STATUSES, STATUS_LABEL, type ActivityKind, type Project } from '../types'

const open = (projectId: string, route: Route | string, taskId?: string) => {
  const s = useApp.getState()
  if (s.currentProjectId !== projectId) s.setCurrent(projectId)
  navigate(route)
  if (taskId) s.openTask(taskId)
}

const healthLabel = (score: number): HealthLabel => (score >= 78 ? 'On Track' : score >= 58 ? 'At Risk' : 'Off Track')
const varianceText = (a: Analysis) =>
  a.health.label === 'Completed' ? 'Delivered' : a.varianceDays > 0 ? `${plural(a.varianceDays, 'day')} behind` : a.varianceDays < 0 ? `${plural(-a.varianceDays, 'day')} ahead` : 'On plan'

/* ───────────────────────────── KPI strip ───────────────────────────── */

function Kpi({ label, value, sub, icon, tone }: { label: string; value: ReactNode; sub: ReactNode; icon: ReactNode; tone?: 'red' }) {
  return (
    <div className="flex-1 basis-[180px] px-5 py-4">
      <p className="flex items-center gap-1.5 text-[13px] text-ink-500">
        <span className="text-ink-400">{icon}</span>
        {label}
      </p>
      <p className={cx('mt-1.5 text-[28px] leading-none font-semibold tracking-tight', tone === 'red' ? 'text-red-600' : 'text-ink-900')}>{value}</p>
      <p className="mt-1.5 text-xs text-ink-500">{sub}</p>
    </div>
  )
}

/* ───────────────────────────── Project progress ───────────────────────────── */

function ProjectProgress({ items }: { items: { p: Project; a: Analysis }[] }) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Project progress"
        hint="Work completed against where the schedule expects each project to be today"
        action={
          <div className="flex shrink-0 items-center gap-3 text-xs text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-sm" style={{ background: CHART.actual }} /> Actual
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-0.5 bg-ink-900" /> Planned
            </span>
          </div>
        }
      />
      <div className="flex-1 px-5 pb-4">
        <div className="relative ml-[38%] hidden h-4 text-[11px] text-ink-400 sm:block" aria-hidden>
          {[0, 25, 50, 75, 100].map((t) => (
            <span key={t} className="tnum absolute -translate-x-1/2" style={{ left: `${t}%` }}>
              {t}%
            </span>
          ))}
        </div>
        <ul>
          {items.map(({ p, a }) => {
            const done = a.health.label === 'Completed'
            return (
              <li key={p.id} className="relative">
                <button
                  type="button"
                  onClick={() => open(p.id, 'gantt')}
                  onMouseEnter={() => setHover(p.id)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(p.id)}
                  onBlur={() => setHover(null)}
                  className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-canvas"
                >
                  <span className="flex w-[38%] min-w-0 shrink-0 items-center gap-2 pr-2">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                    <span className="truncate text-[13px] font-medium text-ink-900">{p.name}</span>
                  </span>
                  <span className="relative h-3 flex-1 rounded-r-[4px] bg-line-soft">
                    <span className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${a.percent}%`, background: done ? CHART.good : CHART.actual }} />
                    {[25, 50, 75].map((t) => (
                      <span key={t} className="absolute inset-y-0 w-px bg-white/70" style={{ left: `${t}%` }} />
                    ))}
                    {!done && <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-ink-900" style={{ left: `calc(${a.planned}% - 1px)` }} />}
                  </span>
                  <span className="tnum w-10 shrink-0 text-right text-[13px] font-semibold text-ink-900">{a.percent}%</span>
                </button>
                {hover === p.id && (
                  <div className="pointer-events-none absolute top-full right-0 z-20 -mt-1 w-64 animate-fade rounded-lg border border-line bg-white p-3 text-xs shadow-pop">
                    <p className="mb-1.5 font-semibold text-ink-900">{p.name}</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-ink-600">
                      <dt>Actual</dt>
                      <dd className="tnum text-right font-medium text-ink-900">{a.percent}%</dd>
                      <dt>Planned by today</dt>
                      <dd className="tnum text-right font-medium text-ink-900">{a.planned}%</dd>
                      <dt>Schedule</dt>
                      <dd className="text-right font-medium text-ink-900">{varianceText(a)}</dd>
                      <dt>Forecast finish</dt>
                      <dd className="tnum text-right font-medium text-ink-900">{fmtShort(a.forecastEnd)}</dd>
                    </dl>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}

/* ───────────────────────────── Tasks by status ───────────────────────────── */

function StatusChart({ items, current }: { items: { p: Project; a: Analysis }[]; current: Project | null }) {
  const [scope, setScope] = useState<'all' | 'current'>('all')
  const source = scope === 'current' && current ? items.filter((i) => i.p.id === current.id) : items
  const data = STATUSES.map((s) => ({ status: s, name: STATUS_LABEL[s], value: source.reduce((n, i) => n + i.a.counts[s], 0), fill: STATUS_COLOR[s] }))
  const total = data.reduce((n, d) => n + d.value, 0)
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Tasks by status"
        hint={scope === 'current' && current ? current.name : `Across ${plural(items.length, 'project')}`}
        action={
          <Segmented
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'All' },
              { value: 'current', label: 'Current' },
            ]}
          />
        }
      />
      <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-3 px-5 pb-5">
        <div className="relative mx-auto h-[176px] w-[176px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={56} outerRadius={84} paddingAngle={total ? 2 : 0} stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false} />
              <Tooltip
                wrapperStyle={{ outline: 'none', zIndex: 10 }}
                content={({ active, payload }) => {
                  const d = active && payload?.[0]
                  if (!d) return null
                  const value = Number(d.value ?? 0)
                  return (
                    <div className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-pop">
                      <span className="font-semibold text-ink-900">{String(d.name)}</span>
                      <span className="tnum ml-2 text-ink-600">
                        {value} ({total ? Math.round((value / total) * 100) : 0}%)
                      </span>
                    </div>
                  )
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl leading-none font-semibold text-ink-900">{total}</span>
            <span className="mt-1 text-xs text-ink-500">tasks</span>
          </div>
        </div>
        <table className="min-w-[180px] flex-1 text-[13px]">
          <tbody>
            {data.map((d) => (
              <tr key={d.status} className="border-b border-line-soft last:border-0">
                <td className="py-1.5">
                  <span className="flex items-center gap-2 text-ink-700">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.fill }} />
                    {d.name}
                  </span>
                </td>
                <td className="tnum py-1.5 text-right font-semibold text-ink-900">{d.value}</td>
                <td className="tnum w-12 py-1.5 text-right text-ink-500">{total ? Math.round((d.value / total) * 100) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ───────────────────────────── AI Project Insights ───────────────────────────── */

const TONE_ICON: Record<Tone, ReactNode> = {
  critical: <CircleAlert size={15} className="text-red-600" />,
  warning: <TriangleAlert size={15} className="text-amber-600" />,
  info: <Info size={15} className="text-azure-600" />,
  good: <CircleCheck size={15} className="text-emerald-600" />,
}

function InsightColumn({ title, icon, items, empty }: { title: string; icon: ReactNode; items: Insight[]; empty: string }) {
  return (
    <div className="min-w-0 p-4">
      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-900">
        <span className="text-brand-600">{icon}</span>
        {title}
        {items.length > 0 && <span className="tnum rounded-full bg-canvas px-1.5 text-xs font-medium text-ink-500">{items.length}</span>}
      </h3>
      {items.length === 0 ? (
        <p className="flex items-start gap-2 py-1 text-[13px] text-ink-500">
          <CircleCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
          {empty}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => open(i.projectId, i.route, i.taskId)} className="group -mx-2 flex w-[calc(100%+16px)] gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-canvas">
                <span className="mt-0.5 shrink-0">{TONE_ICON[i.tone]}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink-900 group-hover:text-brand-700">{i.title}</span>
                  <span className="block text-xs leading-relaxed text-ink-500">{i.detail}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-400">{i.projectName}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ───────────────────────────── Deadlines and activity ───────────────────────────── */

const ACTIVITY_ICON: Record<ActivityKind, ReactNode> = {
  task: <ListChecks size={14} />,
  milestone: <Diamond size={14} />,
  risk: <ShieldAlert size={14} />,
  plan: <Sparkles size={14} />,
  project: <FolderKanban size={14} />,
}

export default function Dashboard() {
  const projects = useApp((s) => s.projects)
  const settings = useApp((s) => s.settings)
  const current = useProject()
  const today = todayISO()

  const items = useMemo(() => projects.map((p) => ({ p, a: analyze(p, today) })), [projects, today])
  const insights = useMemo(() => portfolioInsights(projects, today), [projects, today])
  const active = items.filter((i) => i.a.health.label !== 'Completed')
  const totalTasks = items.reduce((n, i) => n + i.a.leaves.length, 0)
  const doneTasks = items.reduce((n, i) => n + i.a.counts.done, 0)
  const delayed = active.reduce((n, i) => n + i.a.overdue.length, 0)
  const avgHealth = active.length ? Math.round(active.reduce((n, i) => n + i.a.health.score, 0) / active.length) : 100
  const overall = healthLabel(avgHealth)

  const deadlines = useMemo(() => {
    const out: { p: Project; r: Row; todayIdx: number }[] = []
    for (const { p, a } of items) {
      if (a.health.label === 'Completed') continue
      for (const r of a.leaves) if (r.status !== 'done' && r.eIdx <= a.todayIdx + 9) out.push({ p, r, todayIdx: a.todayIdx })
    }
    out.sort((x, y) => x.r.eIdx - y.r.eIdx || Number(y.r.critical) - Number(x.r.critical))
    // Keep room for what is coming: at most three overdue items, then the next ones due.
    const late = out.filter((d) => d.r.overdue)
    const mostLate = late.sort((x, y) => Number(y.r.critical) - Number(x.r.critical) || x.r.eIdx - y.r.eIdx).slice(0, 3)
    return [...mostLate.sort((x, y) => x.r.eIdx - y.r.eIdx), ...out.filter((d) => !d.r.overdue)].slice(0, 7)
  }, [items])

  const activity = useMemo(
    () =>
      projects
        .flatMap((p) => p.activity.map((act) => ({ ...act, project: p })))
        .sort((x, y) => y.ts - x.ts)
        .slice(0, 8),
    [projects],
  )

  if (!projects.length) {
    return (
      <Card>
        <Empty
          icon={<Sparkles size={20} />}
          title="Your workspace is empty"
          action={
            <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => navigate('generator')}>
              Generate a project plan
            </Button>
          }
        >
          Describe a project and ProjectPilot AI builds the charter, WBS, schedule, risk register and resource plan.
        </Empty>
      </Card>
    )
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${settings.workspace} portfolio as of ${fmtLong(today)}`}
        actions={
          <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => navigate('generator')}>
            Generate project plan
          </Button>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap divide-line max-lg:[&>*]:border-b max-lg:[&>*]:border-line-soft lg:divide-x">
          <Kpi label="Total projects" value={projects.length} sub={`${items.length - active.length} completed`} icon={<FolderKanban size={15} />} />
          <Kpi label="Active projects" value={active.length} sub={`${active.filter((i) => i.a.health.label === 'On Track').length} on track, ${active.filter((i) => i.a.health.label === 'At Risk' || i.a.health.label === 'Off Track').length} need attention`} icon={<Flag size={15} />} />
          <Kpi label="Completed tasks" value={doneTasks} sub={`of ${totalTasks} (${totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0}%)`} icon={<ListChecks size={15} />} />
          <Kpi label="Delayed tasks" value={delayed} sub={delayed ? `in ${plural(active.filter((i) => i.a.overdue.length).length, 'project')}` : 'Nothing overdue'} icon={<CalendarClock size={15} />} tone={delayed ? 'red' : undefined} />
          <div className="flex-[1.3] basis-[220px] px-5 py-4">
            <p className="flex items-center justify-between gap-2 text-[13px] text-ink-500">
              Overall project health
              <HealthBadge label={overall} />
            </p>
            <p className="mt-1.5 text-[28px] leading-none font-semibold tracking-tight text-ink-900">
              {avgHealth}
              <span className="text-base font-medium text-ink-400"> / 100</span>
            </p>
            <Progress value={avgHealth} tone={overall === 'On Track' ? 'green' : overall === 'At Risk' ? 'amber' : 'red'} className="mt-2.5" />
          </div>
        </div>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <ProjectProgress items={items} />
        <StatusChart items={items} current={current} />
      </div>

      <Card className="mb-4">
        <CardHeader
          title="AI Project Insights"
          hint="Computed from live schedules, dependencies, workloads and risk registers"
          action={
            <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-canvas px-2 py-1 text-xs text-ink-500">
              <Cpu size={12} /> Built-in analysis engine
            </span>
          }
        />
        <div className="grid border-t border-line-soft sm:grid-cols-2 xl:grid-cols-4 [&>*]:border-line-soft max-xl:[&>*]:border-b sm:[&>*:nth-child(odd)]:border-r xl:[&>*:not(:last-child)]:border-r">
          <InsightColumn title="Projects at risk" icon={<TriangleAlert size={15} />} items={insights.atRisk} empty="Every active project is on track." />
          <InsightColumn title="Upcoming critical deadlines" icon={<CalendarClock size={15} />} items={insights.deadlines} empty="No critical deadlines in the next two weeks." />
          <InsightColumn title="Resource allocation warnings" icon={<Users size={15} />} items={insights.resources} empty="Nobody is over-allocated in the next two weeks." />
          <InsightColumn title="Suggested improvements" icon={<Lightbulb size={15} />} items={insights.improvements} empty="No changes recommended right now." />
        </div>
      </Card>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming deadlines" hint="Most pressing overdue work, then tasks due in the next two weeks" />
          {deadlines.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-ink-500">Nothing is due in the next two weeks.</p>
          ) : (
            <ul className="px-3 pb-3">
              {deadlines.map(({ p, r, todayIdx }) => {
                const lateBy = todayIdx - r.eIdx
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => open(p.id, 'board', r.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-canvas">
                      <span className={cx('flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-center leading-none', r.overdue ? 'bg-red-50 text-red-700' : 'bg-canvas text-ink-700')}>
                        <span className="text-[10px] font-medium">{fmtShort(r.end).split(' ')[0]}</span>
                        <span className="tnum mt-0.5 text-sm font-semibold">{fmtShort(r.end).split(' ')[1]}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
                          {r.task.milestone && <Diamond size={11} className="shrink-0 text-amber-600" fill="currentColor" />}
                          <span className="truncate">{r.task.name}</span>
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {r.code}, {p.name}
                        </span>
                      </span>
                      <span className="hidden shrink-0 sm:block">
                        <Owner resource={p.resources.find((x) => x.id === r.task.ownerId)} showName={false} />
                      </span>
                      <span className={cx('w-24 shrink-0 text-right text-xs', r.overdue ? 'font-medium text-red-600' : 'text-ink-500')}>
                        {r.overdue ? `${plural(lateBy, 'day')} overdue` : relativeDay(r.end, today)}
                        {r.critical && <span className="block text-[11px] font-normal text-ink-400">critical path</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent project activity" hint="Latest changes across the workspace" />
          {activity.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-ink-500">Activity appears here as tasks move and plans change.</p>
          ) : (
            <ul className="px-5 pb-4">
              {activity.map((act, i) => (
                <li key={act.id} className="relative flex gap-3 pb-3 last:pb-0">
                  {i < activity.length - 1 && <span className="absolute top-7 bottom-0 left-[13px] w-px bg-line" />}
                  <span className={cx('z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full', act.kind === 'milestone' ? 'bg-amber-50 text-amber-700' : act.kind === 'risk' ? 'bg-red-50 text-red-600' : act.kind === 'plan' ? 'bg-brand-50 text-brand-600' : 'bg-canvas text-ink-500')}>
                    {ACTIVITY_ICON[act.kind]}
                  </span>
                  <span className="min-w-0 flex-1 pt-0.5">
                    <span className="block text-[13px] text-ink-900">{act.text}</span>
                    <button type="button" onClick={() => open(act.project.id, 'wbs')} className="max-w-full truncate text-xs text-ink-500 hover:text-brand-700">
                      {act.project.name}
                    </button>
                  </span>
                  <span className="shrink-0 pt-0.5 text-xs whitespace-nowrap text-ink-400">{timeAgo(act.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Project health overview" hint="Health combines schedule performance, overdue work, open risk and the forecast against the target date" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="border-y border-line bg-canvas/60 text-left text-xs font-medium text-ink-500">
                <th className="py-2 pr-2 pl-5 font-medium">Project</th>
                <th className="px-2 py-2 font-medium">Health</th>
                <th className="w-40 px-2 py-2 font-medium">Progress</th>
                <th className="px-2 py-2 font-medium">Schedule</th>
                <th className="px-2 py-2 font-medium">Forecast finish</th>
                <th className="px-2 py-2 font-medium">Stage</th>
                <th className="px-2 py-2 text-right font-medium">Open risks</th>
                <th className="w-12 py-2 pr-5" />
              </tr>
            </thead>
            <tbody>
              {items.map(({ p, a }) => {
                const done = a.health.label === 'Completed'
                const openRisks = p.risks.filter((r) => r.status !== 'closed')
                const high = openRisks.filter((r) => riskScore(r) >= 10).length
                const stage = a.phases.find((ph) => ph.status !== 'done')
                return (
                  <tr key={p.id} className={cx('border-b border-line-soft transition-colors last:border-0 hover:bg-canvas/70', p.id === current?.id && 'bg-brand-50/40')}>
                    <td className="py-2.5 pr-2 pl-5">
                      <button type="button" onClick={() => open(p.id, 'wbs')} className="flex max-w-[300px] items-center gap-2 text-left font-medium text-ink-900 hover:text-brand-700">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                        <span className="truncate">{p.name}</span>
                      </button>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <HealthBadge label={a.health.label} />
                        {!done && <span className="tnum text-xs text-ink-500">{a.health.score}</span>}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2">
                        <Progress value={a.percent} tone={done ? 'green' : 'brand'} className="flex-1" />
                        <span className="tnum w-9 text-right text-ink-700">{a.percent}%</span>
                      </span>
                    </td>
                    <td className={cx('px-2 py-2.5 whitespace-nowrap', !done && a.varianceDays > 2 ? 'font-medium text-red-600' : 'text-ink-700')}>{varianceText(a)}</td>
                    <td className="tnum px-2 py-2.5 whitespace-nowrap text-ink-700">
                      {fmtShort(done ? a.end : a.forecastEnd)}
                      {!done && a.slipDays > 0 && <span className="ml-1.5 text-xs font-medium text-red-600">+{a.slipDays}d</span>}
                      {!done && a.slipDays <= 0 && <span className="ml-1.5 text-xs text-ink-400">target {fmtShort(fromWIdx(a.targetIdx))}</span>}
                    </td>
                    <td className="px-2 py-2.5">{stage ? <span className="block max-w-[190px] truncate text-ink-700">{stage.task.name}</span> : <StatusPill status="done" />}</td>
                    <td className="tnum px-2 py-2.5 text-right text-ink-700">
                      {openRisks.length}
                      {high > 0 && <span className="ml-1.5 text-xs font-medium text-orange-700">{high} high</span>}
                    </td>
                    <td className="py-2.5 pr-5 text-right">
                      <button type="button" aria-label={`Open ${p.name}`} onClick={() => open(p.id, 'gantt')} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-900/5 hover:text-ink-900">
                        <ArrowRight size={15} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
