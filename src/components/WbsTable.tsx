import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, CornerDownRight, Diamond, PanelRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { fmtShort } from '../lib/dates'
import { plural } from '../lib/format'
import { analyze, visibleRows, type Row } from '../lib/schedule'
import { useApp } from '../store'
import type { Priority, Project, Status } from '../types'
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from '../types'
import { cellInputCls, ConfirmDialog, cx, IconButton, InlineNumber, InlineText, StatusPill } from './ui'

interface Props {
  project: Project
  /** Fewer columns, for the generator's results view. */
  compact?: boolean
  /** Case-insensitive name filter. Matching rows are shown with their ancestors. */
  filter?: string
}

/** Hierarchical, editable tree-table over the project's WBS. All edits go through the store. */
export function WbsTable({ project, compact, filter = '' }: Props) {
  const collapsed = useApp((s) => s.collapsed)
  const { updateTask, addTask, moveTask, deleteTask, toggleCollapsed, openTask } = useApp.getState()
  const [toDelete, setToDelete] = useState<Row | null>(null)
  const a = analyze(project)

  let rows: Row[]
  const text = filter.trim().toLowerCase()
  if (text) {
    const keep = new Set<string>()
    for (const r of a.rows) {
      if (!r.task.name.toLowerCase().includes(text) && !r.code.startsWith(text)) continue
      let cur: Row | undefined = r
      while (cur) {
        keep.add(cur.id)
        cur = cur.task.parentId ? a.byId.get(cur.task.parentId) : undefined
      }
    }
    rows = a.rows.filter((r) => keep.has(r.id))
  } else rows = visibleRows(a.rows, collapsed)

  const siblingIndex = (r: Row) => {
    const sibs = r.task.parentId ? a.byId.get(r.task.parentId)!.childIds : a.phases.map((p) => p.id)
    return { i: sibs.indexOf(r.id), n: sibs.length }
  }
  const th = 'px-2 py-2 text-left text-xs font-medium text-ink-500 whitespace-nowrap'

  return (
    <div className="overflow-x-auto">
      <table className={cx('w-full table-fixed border-collapse text-[13px]', compact ? 'min-w-[860px]' : 'min-w-[1100px]')}>
        <colgroup>
          <col style={{ width: 74 }} />
          <col />
          <col style={{ width: compact ? 190 : 132 }} />
          <col style={{ width: 56 }} />
          <col style={{ width: 118 }} />
          <col style={{ width: 62 }} />
          {!compact && <col style={{ width: 92 }} />}
          {!compact && <col style={{ width: 128 }} />}
          <col style={{ width: compact ? 110 : 84 }} />
          <col style={{ width: compact ? 68 : 142 }} />
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-canvas/60">
            <th className={cx(th, 'pl-4')}>WBS</th>
            <th className={th}>Task</th>
            <th className={th}>Owner</th>
            <th className={th}>Days</th>
            <th className={th}>Start</th>
            <th className={th}>Finish</th>
            {!compact && <th className={th}>Priority</th>}
            {!compact && <th className={th}>Status</th>}
            <th className={th}>Depends on</th>
            <th className={cx(th, 'pr-4 text-right')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const t = r.task
            const pos = siblingIndex(r)
            const isPhase = r.depth === 0
            const deps = t.dependencies.map((d) => a.byId.get(d)?.code).filter(Boolean)
            return (
              <tr key={r.id} className={cx('group border-b border-line-soft transition-colors hover:bg-brand-50/40', isPhase && 'bg-canvas/50')}>
                <td className="py-1 pr-2 pl-4">
                  <div className="flex items-center" style={{ paddingLeft: r.depth * 14 }}>
                    {r.isSummary ? (
                      <button
                        type="button"
                        aria-label={collapsed[r.id] ? `Expand ${t.name}` : `Collapse ${t.name}`}
                        aria-expanded={!collapsed[r.id]}
                        onClick={() => toggleCollapsed(r.id)}
                        className="mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-ink-900/8"
                      >
                        {collapsed[r.id] && !text ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </button>
                    ) : (
                      <span className="mr-0.5 w-5 shrink-0" />
                    )}
                    <span className={cx('tnum', isPhase ? 'font-semibold text-ink-900' : 'text-ink-600')}>{r.code}</span>
                  </div>
                </td>
                <td className="px-1 py-1">
                  <div className="flex items-center gap-1">
                    {t.milestone && (
                      <span title="Milestone" className="shrink-0 text-amber-600">
                        <Diamond size={13} fill="currentColor" />
                      </span>
                    )}
                    <InlineText value={t.name} onCommit={(v) => v && updateTask(r.id, { name: v })} className={cx(isPhase && 'font-semibold')} />
                    {r.critical && r.status !== 'done' && !r.isSummary && !compact && (
                      <span title="On the critical path" className="shrink-0 rounded bg-red-50 px-1 text-[10px] font-semibold text-red-700">
                        CP
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-1 py-1">
                  {r.isSummary ? (
                    <span className="px-1.5 text-ink-400">{plural(r.leafIds.length, 'task')}</span>
                  ) : (
                    <select aria-label="Owner" className={cellInputCls} value={t.ownerId ?? ''} onChange={(e) => updateTask(r.id, { ownerId: e.target.value || null })}>
                      <option value="">Unassigned</option>
                      {project.resources.map((res) => (
                        <option key={res.id} value={res.id}>
                          {res.name}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-1 py-1">
                  {r.isSummary ? (
                    <span className="tnum px-1.5 text-ink-500">{r.duration}</span>
                  ) : (
                    <InlineNumber label="Duration in working days" value={t.duration} min={0} max={500} onCommit={(v) => updateTask(r.id, { duration: v })} />
                  )}
                </td>
                <td className="px-1 py-1">
                  <input type="date" aria-label="Start date" className={cx(cellInputCls, 'tnum')} value={r.start} onChange={(e) => e.target.value && updateTask(r.id, { start: e.target.value })} />
                </td>
                <td className={cx('tnum px-2 py-1 whitespace-nowrap', r.overdue ? 'font-medium text-red-600' : 'text-ink-600')} title={r.overdue ? 'Overdue' : undefined}>
                  {fmtShort(r.end)}
                </td>
                {!compact && (
                  <td className="px-1 py-1">
                    {r.isSummary ? null : (
                      <select aria-label="Priority" className={cellInputCls} value={t.priority} onChange={(e) => updateTask(r.id, { priority: e.target.value as Priority })}>
                        {PRIORITIES.map((p) => (
                          <option key={p} value={p}>
                            {PRIORITY_LABEL[p]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                )}
                {!compact && (
                  <td className="px-1 py-1">
                    {r.isSummary ? (
                      <span className="flex items-center justify-between gap-1 px-1.5">
                        <StatusPill status={r.status} />
                        <span className="tnum text-xs text-ink-500">{r.progress}%</span>
                      </span>
                    ) : (
                      <select aria-label="Status" className={cellInputCls} value={t.status} onChange={(e) => updateTask(r.id, { status: e.target.value as Status })}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                )}
                <td className="px-1 py-1">
                  <button
                    type="button"
                    onClick={() => openTask(r.id)}
                    title="Edit dependencies"
                    className={cx('tnum h-7 w-full truncate rounded-md px-1.5 text-left hover:bg-ink-900/5', deps.length ? 'text-ink-700' : 'text-ink-300')}
                  >
                    {deps.length ? deps.join(', ') : 'Add'}
                  </button>
                </td>
                <td className="py-1 pr-3 pl-1">
                  <div className="flex items-center justify-end opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {!compact && (
                      <>
                        <IconButton label="Add subtask" onClick={() => addTask({ parentId: r.id })}>
                          <CornerDownRight size={14} />
                        </IconButton>
                        <IconButton label="Move up" disabled={pos.i === 0} onClick={() => moveTask(r.id, -1)}>
                          <ArrowUp size={14} />
                        </IconButton>
                        <IconButton label="Move down" disabled={pos.i === pos.n - 1} onClick={() => moveTask(r.id, 1)}>
                          <ArrowDown size={14} />
                        </IconButton>
                      </>
                    )}
                    <IconButton label="Open details" onClick={() => openTask(r.id)}>
                      <PanelRight size={14} />
                    </IconButton>
                    <IconButton label="Delete" onClick={() => setToDelete(r)} className="hover:text-red-600">
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-10 text-center text-ink-500">
                {text ? `No tasks match “${filter.trim()}”.` : 'This project has no tasks yet. Add a phase to start the breakdown.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {toDelete && (
        <ConfirmDialog
          title={`Delete ${toDelete.code} ${toDelete.task.name}?`}
          body={toDelete.isSummary ? `This also deletes its ${plural(toDelete.leafIds.length, 'task')} and any dependencies on them.` : 'Dependencies on this task are removed. This cannot be undone.'}
          confirmLabel="Delete"
          onClose={() => setToDelete(null)}
          onConfirm={() => deleteTask(toDelete.id)}
        />
      )}
    </div>
  )
}
