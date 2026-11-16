import { CornerDownRight, Diamond, Link2, Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addWorkdays, fmtDuration, fmtLong, fmtShort } from '../lib/dates'
import { plural } from '../lib/format'
import { analyze, descendantIds, type Row } from '../lib/schedule'
import { useApp, useProject } from '../store'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, type Priority, type Status } from '../types'
import { Badge, Button, ConfirmDialog, cx, Field, IconButton, InlineNumber, inputCls, Progress, StatusPill, textareaCls } from './ui'

/** Side panel for editing any task. Opened from the WBS, Gantt, board, search and dashboard. */
export function TaskDrawer() {
  const id = useApp((s) => s.drawerTaskId)
  const project = useProject()
  const close = () => useApp.getState().openTask(null)

  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest('[role="dialog"]')) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [id])

  if (!id || !project) return null
  const a = analyze(project)
  const row = a.byId.get(id)
  if (!row) return null

  return (
    <>
      <div className="no-print fixed inset-0 z-40 bg-navy-950/20 animate-fade" onClick={close} />
      <aside className="no-print fixed inset-y-0 right-0 z-40 flex w-full max-w-[460px] animate-slide-in flex-col border-l border-line bg-white shadow-drawer" aria-label="Task details">
        <Body key={row.id} row={row} rows={a.rows} byId={a.byId} onClose={close} />
      </aside>
    </>
  )
}

function Body({ row, rows, byId, onClose }: { row: Row; rows: Row[]; byId: Map<string, Row>; onClose: () => void }) {
  const project = useProject()!
  const { updateTask, deleteTask, addTask, addDependency, removeDependency, openTask } = useApp.getState()
  const t = row.task
  const [name, setName] = useState(t.name)
  const [description, setDescription] = useState(t.description)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setName(t.name), [t.name])
  useEffect(() => setDescription(t.description), [t.description])

  const kind = row.depth === 0 ? 'Phase' : t.milestone && t.duration === 0 ? 'Milestone' : row.isSummary ? 'Summary task' : 'Task'
  const blocked = new Set([row.id, ...descendantIds(project.tasks, row.id)])
  let up = t.parentId
  while (up) {
    blocked.add(up)
    up = byId.get(up)?.task.parentId ?? null
  }
  const candidates = rows.filter((r) => !blocked.has(r.id) && !t.dependencies.includes(r.id))
  const successors = row.isSummary ? [] : row.succs.map((s) => byId.get(s)!).filter(Boolean)

  return (
    <>
      <header className="flex items-center gap-2 border-b border-line-soft px-5 py-3">
        <span className="tnum rounded-md bg-canvas px-1.5 py-0.5 text-xs font-semibold text-ink-600">{row.code}</span>
        <span className="text-[13px] text-ink-500">{kind}</span>
        {row.critical && row.status !== 'done' && <Badge tone="red">Critical path</Badge>}
        {row.overdue && <Badge tone="red" icon={<TriangleAlert size={12} />}>Overdue</Badge>}
        <span className="ml-auto flex items-center gap-0.5">
          <IconButton label="Delete" onClick={() => setConfirm(true)}>
            <Trash2 size={15} />
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <X size={17} />
          </IconButton>
        </span>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <textarea
          value={name}
          aria-label="Task name"
          rows={name.length > 42 ? 2 : 1}
          onChange={(e) => setName(e.target.value.replace(/\n/g, ''))}
          onBlur={() => name.trim() && name.trim() !== t.name && updateTask(row.id, { name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="-mx-1.5 w-[calc(100%+12px)] resize-none rounded-lg border border-transparent px-1.5 py-1 text-lg leading-snug font-semibold text-ink-900 hover:border-line focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />

        {row.isSummary ? (
          <div className="rounded-xl bg-canvas p-3.5 text-[13px] text-ink-600">
            <div className="mb-2 flex items-center justify-between">
              <StatusPill status={row.status} />
              <span className="tnum font-medium text-ink-900">{row.progress}%</span>
            </div>
            <Progress value={row.progress} />
            <p className="mt-2.5">
              {fmtLong(row.start)} to {fmtLong(row.end)}, {plural(row.duration, 'working day')}. Dates, status and progress roll up from {plural(row.leafIds.length, 'task')}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
            <Field label="Status">
              <select className={inputCls} value={t.status} onChange={(e) => updateTask(row.id, { status: e.target.value as Status })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select className={inputCls} value={t.priority} onChange={(e) => updateTask(row.id, { priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner" className="col-span-2">
              <select className={inputCls} value={t.ownerId ?? ''} onChange={(e) => updateTask(row.id, { ownerId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {project.resources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} — {r.role}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
          <Field label="Start date">
            <input type="date" className={cx(inputCls, 'tnum')} value={row.start} onChange={(e) => e.target.value && updateTask(row.id, { start: e.target.value })} />
          </Field>
          {row.isSummary ? (
            <Field label="Finish date">
              <input className={cx(inputCls, 'tnum')} value={fmtLong(row.end)} disabled readOnly />
            </Field>
          ) : (
            <Field label="Duration" hint="working days">
              <InlineNumber
                label="Duration in working days"
                value={t.duration}
                min={0}
                max={500}
                onCommit={(v) => updateTask(row.id, { duration: v })}
                className="h-9! border-line! bg-white! px-3! text-sm!"
              />
            </Field>
          )}
          {!row.isSummary && (
            <p className="col-span-2 -mt-1.5 text-[13px] text-ink-500">
              {t.duration === 0 ? `Milestone on ${fmtLong(row.end)}.` : `Finishes ${fmtLong(row.end)}.`}{' '}
              {row.status !== 'done' && (row.critical ? 'No slack: a delay moves the project finish.' : `${plural(row.slack, 'working day')} of slack.`)}
            </p>
          )}
        </div>

        {!row.isSummary && (
          <>
            <Field label="Progress" hint={`${t.progress}%`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={t.progress}
                onChange={(e) => updateTask(row.id, { progress: Number(e.target.value) })}
                className="h-2 w-full accent-brand-600"
              />
            </Field>
            <label className="flex items-center gap-2.5 text-[13px] text-ink-700">
              <input type="checkbox" checked={t.milestone} onChange={(e) => updateTask(row.id, { milestone: e.target.checked })} className="h-4 w-4 rounded accent-brand-600" />
              <Diamond size={14} className="text-amber-600" />
              Mark as milestone
              {t.milestone && t.duration > 0 && (
                <button type="button" className="ml-auto text-xs font-medium text-brand-700 hover:underline" onClick={() => updateTask(row.id, { duration: 0 })}>
                  Make it a zero-day gate
                </button>
              )}
            </label>
          </>
        )}

        <Field label="Description">
          <textarea
            className={textareaCls}
            rows={3}
            value={description}
            placeholder="What does done look like?"
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== t.description && updateTask(row.id, { description })}
          />
        </Field>

        <section>
          <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink-700">
            <Link2 size={14} /> Depends on
          </h3>
          {t.dependencies.length === 0 && <p className="mb-2 text-[13px] text-ink-400">No predecessors. This {row.isSummary ? 'group' : 'task'} can start any time.</p>}
          <ul className="mb-2 space-y-1">
            {t.dependencies.map((d) => {
              const p = byId.get(d)
              if (!p) return null
              return (
                <li key={d} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px]">
                  <button type="button" className="tnum shrink-0 font-semibold text-brand-700 hover:underline" onClick={() => openTask(d)}>
                    {p.code}
                  </button>
                  <span className="min-w-0 flex-1 truncate text-ink-700">{p.task.name}</span>
                  <span className="shrink-0 text-xs text-ink-500">ends {fmtShort(p.end)}</span>
                  <IconButton label={`Remove dependency on ${p.code}`} onClick={() => removeDependency(row.id, d)} className="h-6! w-6!">
                    <X size={13} />
                  </IconButton>
                </li>
              )
            })}
          </ul>
          <select
            className={inputCls}
            value=""
            aria-label="Add predecessor"
            onChange={(e) => {
              if (e.target.value) addDependency(row.id, e.target.value)
            }}
          >
            <option value="">Add a predecessor…</option>
            {candidates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} {r.task.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-400">Finish-to-start: this starts the working day after its predecessors finish. The timeline updates automatically.</p>
        </section>

        {successors.length > 0 && (
          <section>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-ink-700">
              <CornerDownRight size={14} /> Blocks {plural(successors.length, 'task')}
            </h3>
            <ul className="space-y-1">
              {successors.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => openTask(s.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1 text-left text-[13px] hover:bg-canvas">
                    <span className="tnum shrink-0 font-semibold text-ink-600">{s.code}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-700">{s.task.name}</span>
                    <span className="shrink-0 text-xs text-ink-500">{fmtShort(s.start)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-5 py-3">
        <Button
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => {
            const nid = addTask({ parentId: row.id })
            if (nid) openTask(nid)
          }}
        >
          Add subtask
        </Button>
        {!row.isSummary && t.duration > 0 && (
          <span className="ml-auto text-xs text-ink-500">
            {fmtDuration(t.duration)}, next free day {fmtShort(addWorkdays(row.end, 1))}
          </span>
        )}
      </footer>

      {confirm && (
        <ConfirmDialog
          title={`Delete ${row.code} ${t.name}?`}
          body={row.isSummary ? `This also deletes its ${plural(row.leafIds.length, 'task')}. Dependencies on them are removed.` : 'Dependencies on this task are removed. This cannot be undone.'}
          confirmLabel="Delete"
          onClose={() => setConfirm(false)}
          onConfirm={() => deleteTask(row.id)}
        />
      )}
    </>
  )
}
