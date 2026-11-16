import { CalendarClock, ChevronsDownUp, ChevronsUpDown, Download, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { NoProject } from '../components/NoProject'
import { Button, Card, PageHeader } from '../components/ui'
import { WbsTable } from '../components/WbsTable'
import { fmtLong } from '../lib/dates'
import { download, plural, slug } from '../lib/format'
import { tasksCsv } from '../lib/report'
import { analyze } from '../lib/schedule'
import { useApp, useProject } from '../store'

export default function Wbs() {
  const project = useProject()
  const [filter, setFilter] = useState('')
  if (!project) return <NoProject />

  const a = analyze(project)
  const { addTask, setCollapsed, autoSchedule, toast, openTask } = useApp.getState()
  const summaries = a.rows.filter((r) => r.isSummary).map((r) => r.id)

  return (
    <>
      <PageHeader
        title="WBS Builder"
        description={
          <>
            {plural(a.phases.length, 'phase')}, {plural(a.leaves.length - a.milestones.filter((m) => m.task.duration === 0).length, 'task')} and {plural(a.milestones.length, 'milestone')} from {fmtLong(a.start)} to{' '}
            {fmtLong(a.end)}. Edit any cell in place; the Gantt timeline and Task Board update with it.
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
            <Button icon={<Download size={15} />} onClick={() => download(`${slug(project.name)}-wbs.csv`, tasksCsv(project), 'text/csv;charset=utf-8')}>
              Export CSV
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => {
                const id = addTask({ parentId: null })
                if (id) openTask(id)
              }}
            >
              Add phase
            </Button>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or WBS code"
              aria-label="Filter tasks"
              className="h-8 w-full rounded-lg border border-line bg-white pr-2 pl-8 text-[13px] placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" icon={<ChevronsUpDown size={14} />} onClick={() => setCollapsed(summaries, false)}>
              Expand all
            </Button>
            <Button size="sm" variant="ghost" icon={<ChevronsDownUp size={14} />} onClick={() => setCollapsed(summaries, true)}>
              Collapse all
            </Button>
          </div>
        </div>
        <WbsTable project={project} filter={filter} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-ink-500">
          <span>Hover a row to add a subtask, reorder it, open its details or delete it.</span>
          <span>Durations are working days. A 0-day task is a milestone gate.</span>
          <span>
            <span className="rounded bg-red-50 px-1 font-semibold text-red-700">CP</span> marks the critical path.
          </span>
        </div>
      </Card>
    </>
  )
}
