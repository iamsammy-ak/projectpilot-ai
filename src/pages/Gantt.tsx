import { CalendarClock, ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-react'
import { useState } from 'react'
import { GanttChart, type GanttView } from '../components/GanttChart'
import { NoProject } from '../components/NoProject'
import { Button, Card, cx, PageHeader, Segmented } from '../components/ui'
import { fmtLong } from '../lib/dates'
import { plural } from '../lib/format'
import { analyze } from '../lib/schedule'
import { useApp, useProject } from '../store'

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: string }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-700 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative h-5 w-9 rounded-full transition-colors', checked ? 'bg-brand-600' : 'bg-ink-300')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left]', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
      {children}
    </label>
  )
}

function Key({ swatch, children }: { swatch: React.ReactNode; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  )
}

export default function Gantt() {
  const project = useProject()
  const [view, setView] = useState<GanttView>('week')
  const [critical, setCritical] = useState(false)
  const [deps, setDeps] = useState(true)
  if (!project) return <NoProject />

  const a = analyze(project)
  const { setCollapsed, autoSchedule, addTask, openTask, toast } = useApp.getState()
  const summaries = a.rows.filter((r) => r.isSummary).map((r) => r.id)
  const openCritical = a.critical.filter((r) => r.status !== 'done')
  const late = a.eIdx - a.targetIdx

  return (
    <>
      <PageHeader
        title="Gantt Timeline"
        description={
          <>
            {fmtLong(a.start)} to {fmtLong(a.end)}.{' '}
            {late > 0 ? (
              <span className="font-medium text-red-600">The plan ends {plural(late, 'working day')} after the target date.</span>
            ) : late === 0 ? (
              'The plan ends on the target date.'
            ) : (
              `The plan ends ${plural(-late, 'working day')} before the target date.`
            )}{' '}
            Drag a bar to move it, or its right edge to change the duration.
          </>
        }
        actions={
          <>
            <Button
              icon={<CalendarClock size={15} />}
              onClick={() => {
                const before = project.tasks
                autoSchedule()
                const changed = useApp.getState().projects.find((p) => p.id === project.id)?.tasks !== before
                toast(changed ? 'Schedule recalculated: unstarted tasks moved to their earliest dates.' : 'The schedule is already as early as its dependencies allow.', changed ? 'success' : 'info')
              }}
            >
              Auto-schedule
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                const parent = a.phases.find((p) => p.status !== 'done') ?? a.phases[a.phases.length - 1]
                const id = addTask({ parentId: parent?.id ?? null })
                if (id) openTask(id)
              }}
            >
              Add task
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-line px-4 py-2.5">
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
          <Toggle checked={critical} onChange={setCritical}>
            {`Critical path (${openCritical.length})`}
          </Toggle>
          <Toggle checked={deps} onChange={setDeps}>
            Dependencies
          </Toggle>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" icon={<ChevronsUpDown size={14} />} onClick={() => setCollapsed(summaries, false)}>
              Expand all
            </Button>
            <Button size="sm" variant="ghost" icon={<ChevronsDownUp size={14} />} onClick={() => setCollapsed(summaries, true)}>
              Collapse all
            </Button>
          </div>
        </div>

        <GanttChart project={project} view={view} showCritical={critical} showDependencies={deps} maxHeight="calc(100dvh - 300px)" />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line px-4 py-2.5 text-xs text-ink-500">
          <Key swatch={<span className="h-2.5 w-6 overflow-hidden rounded-[3px] bg-brand-200"><span className="block h-full w-1/2 bg-brand-500" /></span>}>Task and progress</Key>
          <Key swatch={<span className="h-2.5 w-6 rounded-[3px] bg-emerald-500" />}>Completed</Key>
          {critical && <Key swatch={<span className="h-2.5 w-6 rounded-[3px] bg-red-500" />}>Critical path</Key>}
          <Key swatch={<span className="h-2 w-6 bg-ink-700" />}>Phase</Key>
          <Key swatch={<span className="h-2.5 w-2.5 rotate-45 rounded-[1px] bg-amber-500" />}>Milestone</Key>
          <Key swatch={<span className="h-3 w-0.5 bg-azure-500" />}>Today</Key>
          <Key swatch={<span className="h-3 border-l border-dashed border-ink-400" />}>Target date</Key>
          <Key swatch={<span className="h-2.5 w-6 rounded-[3px] bg-brand-200 ring-1 ring-red-500" />}>Overdue</Key>
        </div>
      </Card>
    </>
  )
}
