import { CalendarDays, Diamond, Link2, Lock, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NoProject } from '../components/NoProject'
import { Button, cx, Owner, PageHeader, PriorityTag, Progress } from '../components/ui'
import { fmtShort } from '../lib/dates'
import { plural } from '../lib/format'
import { analyze, type Row } from '../lib/schedule'
import { useApp, useProject } from '../store'
import { STATUS_COLOR } from '../theme'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Project, type Status } from '../types'

const selectCls = 'h-8 rounded-lg border border-line bg-white px-2 text-[13px] text-ink-700 hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20'

function TaskCard({ row, project, phaseName, blockedBy, onDragStart, onDragEnd, dragging }: { row: Row; project: Project; phaseName: string; blockedBy: Row | null; onDragStart: () => void; onDragEnd: () => void; dragging: boolean }) {
  const t = row.task
  const owner = project.resources.find((r) => r.id === t.ownerId)
  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', row.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={() => useApp.getState().openTask(row.id)}
      onKeyDown={(e) => e.key === 'Enter' && useApp.getState().openTask(row.id)}
      tabIndex={0}
      role="button"
      aria-label={`${row.code} ${t.name}, ${STATUS_LABEL[row.status]}`}
      className={cx(
        'cursor-grab rounded-lg border border-line bg-white p-3 shadow-card transition-[box-shadow,border-color,opacity] hover:border-brand-300 hover:shadow-md active:cursor-grabbing',
        dragging && 'opacity-40',
      )}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-500">
        <span className="tnum font-semibold text-ink-600">{row.code}</span>
        <span className="truncate">{phaseName}</span>
        {t.milestone && <Diamond size={11} className="ml-auto shrink-0 text-amber-600" fill="currentColor" aria-label="Milestone" />}
      </div>
      <p className="text-[13.5px] leading-snug font-medium text-ink-900">{t.name}</p>
      {t.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{t.description}</p>}

      {(row.status === 'in_progress' || row.status === 'review') && (
        <div className="mt-2.5 flex items-center gap-2">
          <Progress value={row.progress} tone={row.overdue ? 'red' : 'brand'} className="flex-1" />
          <span className="tnum text-xs text-ink-500">{row.progress}%</span>
        </div>
      )}

      {blockedBy && (
        <p className="mt-2 flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-1 text-xs text-amber-800">
          <Lock size={11} className="shrink-0" />
          <span className="truncate">
            Waiting on {blockedBy.code} {blockedBy.task.name}
          </span>
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <PriorityTag priority={t.priority} />
        <span className={cx('tnum flex items-center gap-1 text-xs whitespace-nowrap', row.overdue ? 'font-medium text-red-600' : 'text-ink-500')} title={row.overdue ? 'Overdue' : 'Due date'}>
          <CalendarDays size={12} />
          {fmtShort(row.end)}
        </span>
        {row.preds.length > 0 && (
          <span className="tnum flex items-center gap-0.5 text-xs text-ink-400" title={plural(row.preds.length, 'dependency', 'dependencies')}>
            <Link2 size={12} />
            {row.preds.length}
          </span>
        )}
        <span className="ml-auto">
          <Owner resource={owner} showName={false} />
        </span>
      </div>
    </article>
  )
}

export default function Board() {
  const project = useProject()
  const [phase, setPhase] = useState('')
  const [owner, setOwner] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<Status | null>(null)

  const a = project ? analyze(project) : null
  const columns = useMemo(() => {
    const map: Record<Status, Row[]> = { backlog: [], todo: [], in_progress: [], review: [], done: [] }
    if (!a) return map
    const text = q.trim().toLowerCase()
    for (const r of a.leaves) {
      if (phase && r.phaseId !== phase) continue
      if (owner && (r.task.ownerId ?? 'none') !== owner) continue
      if (priority && r.task.priority !== priority) continue
      if (text && !r.task.name.toLowerCase().includes(text) && !r.code.startsWith(text)) continue
      map[r.status].push(r)
    }
    for (const s of STATUSES) map[s].sort((x, y) => (s === 'done' ? y.eIdx - x.eIdx : x.eIdx - y.eIdx))
    return map
  }, [a, phase, owner, priority, q])

  if (!project || !a) return <NoProject />
  const { updateTask, addTask, openTask } = useApp.getState()
  const shown = STATUSES.reduce((n, s) => n + columns[s].length, 0)
  const filtered = !!(phase || owner || priority || q.trim())

  const add = (status: Status) => {
    const parent = phase || a.phases.find((p) => p.status !== 'done')?.id || a.phases[a.phases.length - 1]?.id
    if (!parent) return
    const id = addTask({ parentId: parent, patch: { status, progress: status === 'done' ? 100 : status === 'review' ? 90 : status === 'in_progress' ? 10 : 0 } })
    if (id) openTask(id)
  }

  return (
    <>
      <PageHeader
        title="Task Board"
        description={
          <>
            {filtered ? `${shown} of ${a.leaves.length} tasks shown.` : `${plural(a.leaves.length, 'task')}, ${a.counts.done} completed and ${a.overdue.length} overdue.`} Drag a card to change its status; the WBS and Gantt timeline
            follow.
          </>
        }
        actions={
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => add('todo')}>
            Add task
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" aria-label="Search tasks" className={cx(selectCls, 'w-full pl-8')} />
        </div>
        <select aria-label="Phase" className={selectCls} value={phase} onChange={(e) => setPhase(e.target.value)}>
          <option value="">All phases</option>
          {a.phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} {p.task.name}
            </option>
          ))}
        </select>
        <select aria-label="Assignee" className={selectCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">All assignees</option>
          {project.resources.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          <option value="none">Unassigned</option>
        </select>
        <select aria-label="Priority" className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        {filtered && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setPhase('')
              setOwner('')
              setPriority('')
              setQ('')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="grid min-w-[1060px] grid-cols-5 gap-3">
          {STATUSES.map((status) => (
            <section
              key={status}
              aria-label={STATUS_LABEL[status]}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (over !== status) setOver(status)
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain') || dragId
                setOver(null)
                setDragId(null)
                const row = id ? a.byId.get(id) : null
                if (row && row.status !== status) updateTask(row.id, { status })
              }}
              className={cx('flex max-h-[calc(100dvh-236px)] min-h-[320px] flex-col rounded-xl border bg-ink-900/[0.025] transition-colors', over === status && dragId ? 'border-brand-400 bg-brand-50' : 'border-transparent')}
            >
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
                <h2 className="text-[13px] font-semibold text-ink-900">{STATUS_LABEL[status]}</h2>
                <span className="tnum rounded-full bg-white px-1.5 text-xs font-medium text-ink-500">{columns[status].length}</span>
                <button type="button" aria-label={`Add task to ${STATUS_LABEL[status]}`} title="Add task" onClick={() => add(status)} className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-ink-400 hover:bg-white hover:text-ink-900">
                  <Plus size={15} />
                </button>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {columns[status].map((r) => {
                  const waiting = r.status !== 'done' ? r.preds.map((p) => a.byId.get(p)!).find((p) => p.status !== 'done') : undefined
                  return (
                    <TaskCard
                      key={r.id}
                      row={r}
                      project={project}
                      phaseName={a.byId.get(r.phaseId)?.task.name ?? ''}
                      blockedBy={waiting ?? null}
                      dragging={dragId === r.id}
                      onDragStart={() => setDragId(r.id)}
                      onDragEnd={() => {
                        setDragId(null)
                        setOver(null)
                      }}
                    />
                  )
                })}
                {columns[status].length === 0 && (
                  <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-400">{filtered ? 'No matching tasks' : 'Drop a task here'}</p>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
