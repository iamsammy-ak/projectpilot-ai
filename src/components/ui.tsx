import {
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleDashed,
  Cpu,
  Equal,
  Info,
  OctagonAlert,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { colorFor, initials } from '../lib/format'
import type { Severity } from '../lib/risk'
import type { HealthLabel } from '../lib/schedule'
import { useApp } from '../store'
import { STATUS_COLOR } from '../theme'
import type { PlanSource, Priority, Resource, Status } from '../types'
import { PRIORITY_LABEL, STATUS_LABEL } from '../types'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

/* ───────────────────────────── Buttons ───────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-card',
  secondary: 'bg-white text-ink-700 border border-line hover:bg-canvas hover:border-ink-300',
  ghost: 'text-ink-600 hover:bg-ink-900/5 hover:text-ink-900',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={cx(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        BUTTON[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-900/5 hover:text-ink-900 disabled:opacity-30 disabled:hover:bg-transparent',
        className,
      )}
    >
      {children}
    </button>
  )
}

/* ───────────────────────────── Surfaces ───────────────────────────── */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-xl border border-line bg-white shadow-card', className)}>{children}</section>
}

export function CardHeader({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-ink-500">{hint}</p>}
      </div>
      {action}
    </header>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-500">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">{icon}</div>}
      <p className="font-semibold text-ink-900">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/* ───────────────────────────── Badges ───────────────────────────── */

type Tone = 'neutral' | 'brand' | 'blue' | 'green' | 'amber' | 'orange' | 'red'
const TONE: Record<Tone, string> = {
  neutral: 'bg-ink-900/5 text-ink-600',
  brand: 'bg-brand-50 text-brand-700',
  blue: 'bg-azure-50 text-azure-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-800',
  orange: 'bg-orange-50 text-orange-700',
  red: 'bg-red-50 text-red-700',
}

export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>
      {icon}
      {children}
    </span>
  )
}

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-ink-700">
      <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

const PRIORITY: Record<Priority, { tone: Tone; icon: ReactNode }> = {
  low: { tone: 'neutral', icon: <ChevronDown size={12} strokeWidth={2.5} /> },
  medium: { tone: 'blue', icon: <Equal size={12} strokeWidth={2.5} /> },
  high: { tone: 'orange', icon: <ChevronUp size={12} strokeWidth={2.5} /> },
  critical: { tone: 'red', icon: <ChevronsUp size={12} strokeWidth={2.5} /> },
}

export function PriorityTag({ priority }: { priority: Priority }) {
  const p = PRIORITY[priority]
  return (
    <Badge tone={p.tone} icon={p.icon}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  )
}

const HEALTH: Record<HealthLabel, { tone: Tone; icon: ReactNode }> = {
  'On Track': { tone: 'green', icon: <CircleCheck size={12} /> },
  'At Risk': { tone: 'amber', icon: <TriangleAlert size={12} /> },
  'Off Track': { tone: 'red', icon: <OctagonAlert size={12} /> },
  Completed: { tone: 'brand', icon: <CircleCheck size={12} /> },
  'Not Started': { tone: 'neutral', icon: <CircleDashed size={12} /> },
}

export function HealthBadge({ label }: { label: HealthLabel }) {
  const h = HEALTH[label]
  return (
    <Badge tone={h.tone} icon={h.icon}>
      {label}
    </Badge>
  )
}

const SEVERITY: Record<Severity, Tone> = { Low: 'green', Medium: 'amber', High: 'orange', Critical: 'red' }

export function SeverityBadge({ severity, score }: { severity: Severity; score?: number }) {
  return (
    <Badge tone={SEVERITY[severity]} icon={severity === 'Low' ? <Circle size={8} fill="currentColor" /> : <TriangleAlert size={12} />}>
      {severity}
      {score !== undefined && <span className="tnum opacity-70">{score}</span>}
    </Badge>
  )
}

/** States plainly whether a plan came from the built-in engine or from the Claude API. */
export function SourceBadge({ source }: { source: PlanSource }) {
  if (source === 'claude') return <Badge tone="brand" icon={<Sparkles size={12} />}>Generated by Claude</Badge>
  if (source === 'engine') return <Badge tone="blue" icon={<Cpu size={12} />}>Built-in planning engine</Badge>
  if (source === 'sample') return <Badge icon={<Info size={12} />}>Sample data</Badge>
  return <Badge>Created manually</Badge>
}

/* ───────────────────────────── People ───────────────────────────── */

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none"
      style={{ width: size, height: size, background: colorFor(name), fontSize: Math.max(9, size * 0.4) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

export function Owner({ resource, showName = true, size = 22 }: { resource?: Resource | null; showName?: boolean; size?: number }) {
  if (!resource) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-400">
        <span className="inline-flex items-center justify-center rounded-full border border-dashed border-ink-300" style={{ width: size, height: size }} />
        {showName && 'Unassigned'}
      </span>
    )
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink-700" title={`${resource.name} — ${resource.role}`}>
      <Avatar name={resource.name} size={size} />
      {showName && <span className="truncate">{resource.name}</span>}
    </span>
  )
}

/* ───────────────────────────── Data display ───────────────────────────── */

export function Progress({ value, tone = 'brand', className }: { value: number; tone?: 'brand' | 'green' | 'amber' | 'red'; className?: string }) {
  const fill = { brand: 'bg-brand-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }[tone]
  const track = { brand: 'bg-brand-100', green: 'bg-emerald-100', amber: 'bg-amber-100', red: 'bg-red-100' }[tone]
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full', track, className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-300', fill)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

/** Renders the assistant's small markdown subset: **bold**, "- " bullets and blank-line paragraphs. */
export function RichText({ text }: { text: string }) {
  const bold = (s: string, key: number) => (
    <span key={key}>
      {s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i} className="font-semibold text-ink-900">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </span>
  )
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  const flush = () => {
    if (!bullets.length) return
    blocks.push(
      <ul key={blocks.length} className="my-1.5 list-disc space-y-1 pl-4 marker:text-ink-300">
        {bullets.map((b, i) => (
          <li key={i}>{bold(b, i)}</li>
        ))}
      </ul>,
    )
    bullets = []
  }
  for (const raw of text.split('\n')) {
    const lineText = raw.trimEnd()
    const m = lineText.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/)
    if (m) bullets.push(m[1])
    else {
      flush()
      if (lineText.trim()) blocks.push(<p key={blocks.length} className="my-1.5 first:mt-0 last:mb-0">{bold(lineText.replace(/^#+\s*/, ''), 0)}</p>)
    }
  }
  flush()
  return <div className="text-[13.5px] leading-relaxed text-ink-700">{blocks}</div>
}

/* ───────────────────────────── Forms ───────────────────────────── */

export const inputCls =
  'h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:bg-canvas disabled:text-ink-400'
export const textareaCls = cx(inputCls, 'h-auto min-h-20 resize-y py-2 leading-relaxed')
/** Borderless input for editing a value in place inside a table cell. */
export const cellInputCls =
  'h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[13px] text-ink-900 hover:border-line focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20'

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-700">
        {label}
        {hint && <span className="font-normal text-ink-400">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-[13px]' : 'h-8 px-3 text-[13px]',
            o.value === value ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Text that turns into an input when clicked; commits on blur or Enter, reverts on Escape. */
export function InlineText({ value, onCommit, className, placeholder, multiline }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; multiline?: boolean }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const commit = () => {
    const v = draft.trim()
    if (v !== value) onCommit(v)
  }
  const shared = {
    value: draft,
    placeholder,
    title: multiline ? undefined : draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    className: cx(cellInputCls, multiline && 'block h-auto resize-none [field-sizing:content] py-1 leading-relaxed', className),
  }
  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={Math.max(1, Math.ceil(draft.length / 48))}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value)
            e.currentTarget.blur()
          }
        }}
      />
    )
  }
  return (
    <input
      {...shared}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur())
        }
      }}
    />
  )
}

/** Number input that commits on blur or Enter, so typing "12" does not reschedule on the "1". */
export function InlineNumber({ value, onCommit, min = 0, max = 999, className, label }: { value: number; onCommit: (v: number) => void; min?: number; max?: number; className?: string; label?: string }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(draft))))
    if (Number.isFinite(n) && n !== value) onCommit(n)
    else setDraft(String(value))
  }
  return (
    <input
      type="number"
      aria-label={label}
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={cx(cellInputCls, 'no-spin tnum', className)}
    />
  )
}

/* ───────────────────────────── Overlays ───────────────────────────── */

export function useClickOutside<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  return ref
}

/** Button with a popover anchored beneath it. */
export function Popover({ trigger, children, align = 'left', width = 260 }: { trigger: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false))
  return (
    <div className="relative" ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && (
        <div
          className={cx('absolute top-full z-40 mt-1.5 animate-rise rounded-xl border border-line bg-white p-1.5 shadow-pop', align === 'right' ? 'right-0' : 'left-0')}
          style={{ width, maxWidth: 'calc(100vw - 24px)' }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon, children, onClick, danger, active }: { icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
        danger ? 'text-red-600 hover:bg-red-50' : active ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-canvas',
      )}
    >
      {icon && <span className="shrink-0 opacity-80">{icon}</span>}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

export function Modal({ title, description, onClose, children, footer, width = 520 }: { title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/45 p-4 pt-[8vh] animate-fade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={title} className="w-full animate-rise rounded-2xl bg-white shadow-pop" style={{ maxWidth: width }}>
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</footer>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onClose }: { title: string; body: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-600">{body}</p>
    </Modal>
  )
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  return (
    <div className="no-print pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            'pointer-events-auto flex max-w-[min(560px,90vw)] animate-rise items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-[13px] font-medium text-white shadow-pop',
            t.tone === 'error' ? 'bg-red-600' : 'bg-navy-900',
          )}
        >
          {t.tone === 'error' ? <TriangleAlert size={15} className="mt-0.5 shrink-0" /> : t.tone === 'success' ? <CircleCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" /> : <Info size={15} className="mt-0.5 shrink-0 text-azure-400" />}
          <span>{t.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-mr-1 shrink-0 rounded p-0.5 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
