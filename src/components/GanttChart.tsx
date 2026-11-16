import { ChevronDown, ChevronRight, Diamond } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { addDays, fmtMonth, fmtMonthShort, fmtShort, fromDay, fromWIdx, isWeekend, todayISO, toDay, weekday, wIdx, wIdxFloor } from '../lib/dates'
import { analyze, visibleRows, type Row } from '../lib/schedule'
import { useApp } from '../store'
import type { Project } from '../types'
import { STATUS_LABEL } from '../types'
import { cx } from './ui'

export type GanttView = 'day' | 'week' | 'month'

interface Props {
  project: Project
  view: GanttView
  showCritical: boolean
  showDependencies: boolean
  readOnly?: boolean
  maxHeight?: string
}

const PX: Record<GanttView, number> = { day: 34, week: 16, month: 6 }
const ROW = 36
const HEAD = 66
const BAR = 20

interface Drag {
  id: string
  mode: 'move' | 'resize'
  originX: number
  days: number
  moved: boolean
}

/**
 * Timeline over the same rows as the WBS. Bars can be dragged to move a task or stretched from the
 * right edge to change its duration; both write to the store, which re-runs the dependency cascade.
 */
export function GanttChart({ project, view, showCritical, showDependencies, readOnly, maxHeight = '70vh' }: Props) {
  const collapsed = useApp((s) => s.collapsed)
  const scroller = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const px = PX[view]
  const today = todayISO()
  const a = analyze(project, today)
  const rows = useMemo(() => visibleRows(a.rows, collapsed), [a, collapsed])
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows])

  // Visible range: a Monday shortly before the first task to a Sunday after the last date of interest.
  const first = Math.min(toDay(a.start), toDay(project.start)) - 3
  const startDay = first - weekday(first)
  const last = Math.max(toDay(a.end), toDay(project.targetEnd), toDay(a.forecastEnd)) + 12
  const endDay = last + (6 - weekday(last))
  const days = endDay - startDay + 1
  const width = days * px
  const x = (day: number) => (day - startDay) * px
  const todayDay = toDay(today)
  const todayVisible = todayDay >= startDay && todayDay <= endDay
  const targetDay = toDay(project.targetEnd)

  const months = useMemo(() => {
    const out: { key: string; left: number; width: number; label: string }[] = []
    let d = startDay
    while (d <= endDay) {
      const iso = fromDay(d)
      const [y, m] = iso.split('-').map(Number)
      const next = Math.min(endDay + 1, toDay(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`))
      const w = (next - d) * px
      out.push({ key: iso.slice(0, 7), left: x(d), width: w, label: w > 110 ? fmtMonth(iso) : w > 44 ? fmtMonthShort(iso) : '' })
      d = next
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDay, endDay, px])

  const ticks = useMemo(() => {
    const out: { key: number; left: number; width: number; label: string; muted: boolean }[] = []
    if (view === 'day') {
      for (let d = startDay; d <= endDay; d++) out.push({ key: d, left: x(d), width: px, label: String(Number(fromDay(d).slice(8))), muted: isWeekend(d) })
    } else {
      for (let d = startDay; d <= endDay; d += 7) {
        const iso = fromDay(d)
        out.push({ key: d, left: x(d), width: 7 * px, label: view === 'week' ? fmtShort(iso) : String(Number(iso.slice(8))), muted: false })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDay, endDay, px, view])

  // Bring today into view when the chart opens or the zoom changes.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollLeft = todayVisible ? Math.max(0, x(todayDay) - Math.min(260, el.clientWidth / 3)) : 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, project.id])

  const geometry = (r: Row) => {
    const s = toDay(r.start)
    const e = toDay(r.end)
    const gate = !r.isSummary && r.task.duration === 0
    let left = x(s)
    let w = (e - s + 1) * px
    if (drag && drag.id === r.id && drag.days) {
      if (drag.mode === 'move') left += drag.days * px
      else w = Math.max(px, w + drag.days * px)
    }
    if (gate) {
      const c = left + px / 2
      return { left: c - 8, right: c + 8, width: 16, gate }
    }
    return { left, right: left + w, width: w, gate }
  }

  const commit = (r: Row, d: Drag) => {
    const { updateTask, toast } = useApp.getState()
    if (d.mode === 'move') {
      const moved = addDays(r.start, d.days)
      // Moving earlier lands on the previous working day; moving later on the next one.
      const start = fromWIdx(d.days < 0 ? wIdxFloor(moved) : wIdx(moved))
      if (start === r.start) return
      updateTask(r.id, { start })
      const after = analyze(useApp.getState().projects.find((p) => p.id === project.id)!).byId.get(r.id)
      if (after && after.sIdx > wIdx(start)) {
        toast(`${r.code} cannot start before its predecessors finish, so it was placed on ${fmtShort(after.start)}.`, 'info')
      }
    } else {
      const newEnd = wIdxFloor(fromDay(toDay(r.end) + d.days))
      const duration = Math.max(1, newEnd - r.sIdx + 1)
      if (duration !== r.task.duration) updateTask(r.id, { duration })
    }
  }

  const onPointerDown = (e: ReactPointerEvent, r: Row, mode: Drag['mode']) => {
    if (readOnly || e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ id: r.id, mode, originX: e.clientX, days: 0, moved: false })
  }
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.originX
    const d = Math.round(dx / px)
    if (d !== drag.days || (!drag.moved && Math.abs(dx) > 3)) setDrag({ ...drag, days: d, moved: drag.moved || Math.abs(dx) > 3 })
  }
  const onPointerUp = (r: Row) => {
    if (!drag) return
    const d = drag
    setDrag(null)
    if (!d.moved) useApp.getState().openTask(r.id)
    else if (d.days) commit(r, d)
  }

  // Cancel a drag with Escape.
  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrag(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drag])

  const links = useMemo(() => {
    if (!showDependencies) return []
    const out: { key: string; d: string; critical: boolean }[] = []
    for (const r of rows) {
      if (r.isSummary) continue
      const i2 = rowIndex.get(r.id)!
      const to = geometry(r)
      for (const pid of r.preds) {
        const i1 = rowIndex.get(pid)
        if (i1 === undefined) continue
        const p = a.byId.get(pid)!
        const from = geometry(p)
        const x1 = from.right
        const y1 = i1 * ROW + ROW / 2
        const x2 = to.left - 3
        const y2 = i2 * ROW + ROW / 2
        const d =
          x2 >= x1 + 12
            ? `M${x1} ${y1}H${x1 + 6}V${y2}H${x2}`
            : `M${x1} ${y1}H${x1 + 6}V${y1 + (y2 > y1 ? ROW / 2 : -ROW / 2)}H${x2 - 8}V${y2}H${x2}`
        out.push({ key: `${pid}>${r.id}`, d, critical: showCritical && p.critical && r.critical && r.status !== 'done' })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rowIndex, showDependencies, showCritical, px, startDay, drag])

  const bodyHeight = rows.length * ROW
  const gridBg =
    view === 'month'
      ? `repeating-linear-gradient(to right, var(--color-line-soft) 0, var(--color-line-soft) 1px, transparent 1px, transparent ${7 * px}px)`
      : `repeating-linear-gradient(to right, var(--color-line-soft) 0, var(--color-line-soft) 1px, transparent 1px, transparent ${7 * px}px), repeating-linear-gradient(to right, transparent 0, transparent ${5 * px}px, rgb(19 26 46 / 0.035) ${5 * px}px, rgb(19 26 46 / 0.035) ${7 * px}px)`
  const rowBg = `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW - 1}px, var(--color-line-soft) ${ROW - 1}px, var(--color-line-soft) ${ROW}px)`

  return (
    <div ref={scroller} className="relative overflow-auto overscroll-x-contain" style={{ maxHeight }}>
      <div className="relative" style={{ width: 'max-content', minWidth: '100%' }}>
        {/* Header */}
        <div className="sticky top-0 z-20 flex border-b border-line bg-white" style={{ height: HEAD }}>
          <div className="sticky left-0 z-30 flex w-[230px] shrink-0 items-end border-r border-line bg-white px-3 pb-2 text-xs font-medium text-ink-500 xl:w-[440px]">
            <span className="flex-1">Task</span>
            <span className="hidden w-[68px] xl:block">Start</span>
            <span className="hidden w-[68px] xl:block">Finish</span>
            <span className="hidden w-10 text-right xl:block">Days</span>
          </div>
          <div className="relative shrink-0" style={{ width }}>
            {months.map((m) => (
              <div key={m.key} className="absolute top-[18px] h-6 truncate border-l border-line px-2 pt-1 text-xs font-semibold text-ink-700" style={{ left: m.left, width: m.width }}>
                {m.label}
              </div>
            ))}
            {ticks.map((t) => (
              <div
                key={t.key}
                className={cx('tnum absolute bottom-0 flex h-6 items-center border-l border-line-soft text-[11px]', view === 'day' ? 'justify-center' : 'pl-1.5', t.muted ? 'text-ink-300' : 'text-ink-500')}
                style={{ left: t.left, width: t.width }}
              >
                {t.label}
              </div>
            ))}
            {todayVisible && (
              <span className="absolute top-0.5 z-10 -translate-x-1/2 rounded bg-azure-500 px-1.5 py-px text-[10px] leading-[14px] font-semibold text-white" style={{ left: x(todayDay) + px / 2 }}>
                Today
              </span>
            )}
            <span className="absolute top-0.5 z-10 -translate-x-full rounded-l bg-ink-700 px-1.5 py-px text-[10px] leading-[14px] font-semibold whitespace-nowrap text-white" style={{ left: x(targetDay) + px }}>
              Target {fmtShort(project.targetEnd)}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="relative flex">
          <div className="sticky left-0 z-10 w-[230px] shrink-0 border-r border-line bg-white xl:w-[440px]">
            {rows.map((r) => (
              <div key={r.id} className={cx('flex items-center border-b border-line-soft px-3 text-[13px]', r.depth === 0 && 'bg-canvas/60')} style={{ height: ROW }}>
                <div className="flex min-w-0 flex-1 items-center" style={{ paddingLeft: r.depth * 12 }}>
                  {r.isSummary ? (
                    <button
                      type="button"
                      aria-label={collapsed[r.id] ? `Expand ${r.task.name}` : `Collapse ${r.task.name}`}
                      onClick={() => useApp.getState().toggleCollapsed(r.id)}
                      className="mr-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-500 hover:bg-ink-900/8"
                    >
                      {collapsed[r.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </button>
                  ) : (
                    <span className="mr-0.5 w-5 shrink-0" />
                  )}
                  <button type="button" onClick={() => useApp.getState().openTask(r.id)} className="flex min-w-0 items-center gap-1.5 text-left hover:text-brand-700" title={r.task.name}>
                    <span className="tnum shrink-0 text-xs text-ink-400">{r.code}</span>
                    {r.task.milestone && <Diamond size={11} className="shrink-0 text-amber-600" fill="currentColor" />}
                    <span className={cx('truncate', r.depth === 0 ? 'font-semibold text-ink-900' : 'text-ink-700')}>{r.task.name}</span>
                  </button>
                </div>
                <span className="tnum hidden w-[68px] shrink-0 text-xs text-ink-500 xl:block">{fmtShort(r.start)}</span>
                <span className={cx('tnum hidden w-[68px] shrink-0 text-xs xl:block', r.overdue ? 'font-medium text-red-600' : 'text-ink-500')}>{fmtShort(r.end)}</span>
                <span className="tnum hidden w-10 shrink-0 text-right text-xs text-ink-500 xl:block">{r.duration}</span>
              </div>
            ))}
          </div>

          <div className="relative shrink-0" style={{ width, height: bodyHeight, backgroundImage: `${rowBg}, ${gridBg}` }}>
            {months.map((m) => (
              <div key={m.key} className="absolute top-0 bottom-0 w-px bg-line" style={{ left: m.left }} />
            ))}
            <div className="absolute top-0 bottom-0 border-l border-dashed border-ink-400" style={{ left: x(targetDay) + px }} title={`Target completion ${fmtShort(project.targetEnd)}`} />
            {todayVisible && <div className="absolute top-0 bottom-0 z-[5] w-0.5 bg-azure-500" style={{ left: x(todayDay) + px / 2 - 1 }} />}

            <svg className="pointer-events-none absolute inset-0" width={width} height={bodyHeight} aria-hidden>
              <defs>
                <marker id="gantt-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0 0 7 3.5 0 7z" fill="#9aa3ba" />
                </marker>
                <marker id="gantt-arrow-critical" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                  <path d="M0 0 7 3.5 0 7z" fill="#d94848" />
                </marker>
              </defs>
              {links.map((l) => (
                <path
                  key={l.key}
                  d={l.d}
                  fill="none"
                  stroke={l.critical ? '#d94848' : '#9aa3ba'}
                  strokeWidth={l.critical ? 1.5 : 1.1}
                  strokeLinejoin="round"
                  markerEnd={l.critical ? 'url(#gantt-arrow-critical)' : 'url(#gantt-arrow)'}
                />
              ))}
            </svg>

            {rows.map((r, i) => {
              const g = geometry(r)
              const done = r.status === 'done'
              const critical = showCritical && r.critical && !done
              const dragging = drag?.id === r.id && drag.moved
              const title = `${r.code} ${r.task.name}\n${fmtShort(r.start)} to ${fmtShort(r.end)}, ${r.duration} working ${r.duration === 1 ? 'day' : 'days'}\n${STATUS_LABEL[r.status]}, ${r.progress}%${r.critical && !done ? '\nCritical path' : ''}${r.overdue ? '\nOverdue' : ''}`
              const top = i * ROW

              if (g.gate) {
                return (
                  <div key={r.id} className="absolute flex items-center" style={{ left: g.left, top, height: ROW }}>
                    <button
                      type="button"
                      title={title}
                      aria-label={`Milestone ${r.task.name}, ${fmtShort(r.end)}`}
                      onPointerDown={(e) => onPointerDown(e, r, 'move')}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => onPointerUp(r)}
                      className={cx('h-[13px] w-[13px] rotate-45 rounded-[2px] ring-2 ring-white', readOnly ? 'cursor-pointer' : 'cursor-grab touch-none', done ? 'bg-emerald-500' : critical ? 'bg-red-500' : 'bg-amber-500')}
                      style={{ marginLeft: 1.5 }}
                    />
                    {view !== 'month' && <span className="pointer-events-none ml-2.5 text-[11px] whitespace-nowrap text-ink-500">{r.task.name}</span>}
                  </div>
                )
              }

              if (r.isSummary) {
                return (
                  <div
                    key={r.id}
                    title={title}
                    role="button"
                    tabIndex={0}
                    aria-label={`${r.task.name}, ${fmtShort(r.start)} to ${fmtShort(r.end)}`}
                    onKeyDown={(e) => e.key === 'Enter' && useApp.getState().openTask(r.id)}
                    onPointerDown={(e) => onPointerDown(e, r, 'move')}
                    onPointerMove={onPointerMove}
                    onPointerUp={() => onPointerUp(r)}
                    className={cx('absolute', readOnly ? 'cursor-pointer' : 'cursor-grab touch-none', dragging && 'opacity-80')}
                    style={{ left: g.left, width: g.width, top: top + 11, height: 12 }}
                  >
                    <div className="h-full overflow-hidden bg-ink-300" style={{ clipPath: 'polygon(0 0,100% 0,100% 100%,calc(100% - 5px) 55%,5px 55%,0 100%)' }}>
                      <div className={cx('h-full', critical ? 'bg-red-600' : 'bg-ink-700')} style={{ width: `${r.progress}%` }} />
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={r.id}
                  title={dragging ? undefined : title}
                  role="button"
                  tabIndex={0}
                  aria-label={`${r.task.name}, ${fmtShort(r.start)} to ${fmtShort(r.end)}, ${r.progress}% complete`}
                  onKeyDown={(e) => e.key === 'Enter' && useApp.getState().openTask(r.id)}
                  onPointerDown={(e) => onPointerDown(e, r, 'move')}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => onPointerUp(r)}
                  className={cx(
                    'group/bar absolute overflow-hidden rounded-[5px] transition-shadow',
                    readOnly ? 'cursor-pointer' : 'cursor-grab touch-none',
                    done ? 'bg-emerald-200' : critical ? 'bg-red-200' : 'bg-brand-200',
                    r.overdue && 'ring-1 ring-red-500',
                    dragging && 'z-10 shadow-pop',
                  )}
                  style={{ left: g.left + 1, width: Math.max(4, g.width - 2), top: top + (ROW - BAR) / 2, height: BAR }}
                >
                  <div className={cx('h-full', done ? 'bg-emerald-500' : critical ? 'bg-red-500' : 'bg-brand-500')} style={{ width: `${r.progress}%` }} />
                  {r.task.milestone && <span className="absolute top-1/2 right-1 h-2 w-2 -translate-y-1/2 rotate-45 bg-amber-400 ring-1 ring-white" />}
                  {!readOnly && (
                    <span
                      onPointerDown={(e) => onPointerDown(e, r, 'resize')}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => onPointerUp(r)}
                      className="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize touch-none bg-ink-900/0 group-hover/bar:bg-ink-900/20"
                      title="Drag to change duration"
                    />
                  )}
                </div>
              )
            })}

            {drag?.moved && (() => {
              const r = a.byId.get(drag.id)
              const i = r ? rowIndex.get(r.id) : undefined
              if (!r || i === undefined) return null
              const g = geometry(r)
              const label =
                drag.mode === 'move'
                  ? `Start ${fmtShort(addDays(r.start, drag.days))}`
                  : `${Math.max(1, wIdxFloor(fromDay(toDay(r.end) + drag.days)) - r.sIdx + 1)} days, ends ${fmtShort(fromWIdx(wIdxFloor(fromDay(toDay(r.end) + drag.days))))}`
              return (
                <span className="tnum pointer-events-none absolute z-20 rounded bg-navy-900 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-white" style={{ left: g.left, top: Math.max(0, i * ROW - 14) }}>
                  {label}
                </span>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
