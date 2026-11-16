import { Bell, Check, ChevronDown, CircleAlert, FolderKanban, Info, ListTree, Menu, Plus, RotateCcw, Search, Settings, ShieldAlert, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { claudeEnabled } from '../ai/claude'
import { portfolioInsights, type Insight } from '../ai/insights'
import { analyze } from '../lib/schedule'
import { navigate } from '../router'
import { useApp, useProject } from '../store'
import { Avatar, ConfirmDialog, cx, MenuItem, Popover, useClickOutside } from './ui'

interface Hit {
  key: string
  kind: 'task' | 'risk' | 'project'
  title: string
  meta: string
  run: () => void
}

function GlobalSearch() {
  const projects = useApp((s) => s.projects)
  const project = useProject()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const ref = useClickOutside<HTMLDivElement>(open, () => setOpen(false))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const text = q.trim().toLowerCase()
    if (!text) return []
    const out: Hit[] = []
    const { setCurrent, openTask } = useApp.getState()
    if (project) {
      for (const r of analyze(project).rows) {
        if (r.task.name.toLowerCase().includes(text) || r.code.startsWith(text)) {
          out.push({ key: r.id, kind: 'task', title: r.task.name, meta: `${r.code} · ${project.name}`, run: () => openTask(r.id) })
        }
      }
      for (const r of project.risks) {
        if (r.description.toLowerCase().includes(text) || r.code.toLowerCase().includes(text)) {
          out.push({ key: r.id, kind: 'risk', title: r.description, meta: `${r.code} · Risk register`, run: () => navigate('risks') })
        }
      }
    }
    for (const p of projects) {
      if (p.name.toLowerCase().includes(text)) {
        out.push({
          key: p.id,
          kind: 'project',
          title: p.name,
          meta: 'Project',
          run: () => {
            setCurrent(p.id)
            navigate('wbs')
          },
        })
      }
    }
    return out.slice(0, 9)
  }, [q, project, projects])

  const choose = (h: Hit) => {
    h.run()
    setOpen(false)
    setQ('')
    input.current?.blur()
  }
  const ICON = { task: <ListTree size={15} />, risk: <ShieldAlert size={15} />, project: <FolderKanban size={15} /> }

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-md" ref={ref}>
      <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
      <input
        ref={input}
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setCursor(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setCursor((c) => Math.min(c + 1, hits.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (e.key === 'Enter' && hits[cursor]) choose(hits[cursor])
          else if (e.key === 'Escape') {
            setOpen(false)
            e.currentTarget.blur()
          }
        }}
        placeholder="Search tasks, risks and projects"
        aria-label="Search"
        className="h-9 w-full rounded-lg border border-line bg-canvas pr-9 pl-9 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded border border-line bg-white px-1.5 text-[11px] text-ink-400 sm:block">/</kbd>
      {open && q.trim() && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 animate-rise rounded-xl border border-line bg-white p-1.5 shadow-pop">
          {hits.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-ink-500">Nothing matches “{q.trim()}”.</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={h.kind + h.key}
                type="button"
                onMouseEnter={() => setCursor(i)}
                onClick={() => choose(h)}
                className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left', i === cursor ? 'bg-brand-50' : '')}
              >
                <span className="shrink-0 text-ink-400">{ICON[h.kind]}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink-900">{h.title}</span>
                  <span className="block truncate text-xs text-ink-500">{h.meta}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function ProjectSwitcher() {
  const projects = useApp((s) => s.projects)
  const project = useProject()
  const setCurrent = useApp((s) => s.setCurrent)
  return (
    <Popover
      align="right"
      width={320}
      trigger={(open, toggle) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="Current project"
          className="flex h-9 max-w-[150px] items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-[13px] font-medium text-ink-700 transition-colors hover:border-ink-300 sm:max-w-[260px]"
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: project?.color ?? '#b5bccc' }} />
          <span className="truncate">{project?.name ?? 'Select project'}</span>
          <ChevronDown size={14} className="shrink-0 text-ink-400" />
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2.5 pt-1 pb-1.5 text-xs text-ink-500">Switch project</p>
          <div className="max-h-72 overflow-y-auto">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setCurrent(p.id)
                  close()
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-canvas"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink-900">{p.name}</span>
                  <span className="block text-xs text-ink-500">
                    {analyze(p).percent}% complete, {analyze(p).health.label.toLowerCase()}
                  </span>
                </span>
                {p.id === project?.id && <Check size={15} className="shrink-0 text-brand-600" />}
              </button>
            ))}
          </div>
          <div className="mt-1 border-t border-line-soft pt-1">
            <MenuItem
              icon={<Plus size={15} />}
              onClick={() => {
                navigate('generator')
                close()
              }}
            >
              New project
            </MenuItem>
          </div>
        </>
      )}
    </Popover>
  )
}

function Notifications() {
  const projects = useApp((s) => s.projects)
  const seenAt = useApp((s) => s.settings.notificationsSeenAt)
  const items = useMemo<Insight[]>(() => {
    const g = portfolioInsights(projects)
    return [...g.deadlines, ...g.atRisk, ...g.resources].filter((i) => i.tone !== 'info').slice(0, 8)
  }, [projects])
  const latest = Math.max(0, ...projects.map((p) => p.updatedAt))
  const unread = items.length > 0 && latest > seenAt

  const go = (i: Insight, close: () => void) => {
    const s = useApp.getState()
    if (s.currentProjectId !== i.projectId) s.setCurrent(i.projectId)
    navigate(i.route)
    if (i.taskId) s.openTask(i.taskId)
    close()
  }

  return (
    <Popover
      align="right"
      width={380}
      trigger={(open, toggle) => (
        <button
          type="button"
          aria-label={`Notifications${unread ? `, ${items.length} new` : ''}`}
          aria-expanded={open}
          onClick={() => {
            toggle()
            if (!open) useApp.getState().updateSettings({ notificationsSeenAt: Date.now() })
          }}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-600 transition-colors hover:bg-ink-900/5"
        >
          <Bell size={18} />
          {unread && <span className="tnum absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{items.length}</span>}
        </button>
      )}
    >
      {(close) => (
        <>
          <p className="px-2.5 pt-1 pb-1.5 text-[13px] font-semibold text-ink-900">Notifications</p>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-ink-500">Nothing needs attention. Overdue work, at-risk projects and over-allocation appear here.</p>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {items.map((i) => (
                <button key={i.id} type="button" onClick={() => go(i, close)} className="flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-canvas">
                  <span className={cx('mt-0.5 shrink-0', i.tone === 'critical' ? 'text-red-600' : 'text-amber-600')}>
                    {i.tone === 'critical' ? <CircleAlert size={16} /> : <TriangleAlert size={16} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink-900">{i.title}</span>
                    <span className="block text-xs text-ink-500">{i.detail}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink-400">{i.projectName}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </Popover>
  )
}

function UserMenu() {
  const settings = useApp((s) => s.settings)
  const [confirm, setConfirm] = useState(false)
  const usingClaude = claudeEnabled(settings)
  return (
    <>
      <Popover
        align="right"
        width={250}
        trigger={(open, toggle) => (
          <button type="button" onClick={toggle} aria-expanded={open} aria-label="Account menu" className="rounded-full ring-brand-500/30 transition-shadow hover:ring-4">
            <Avatar name={settings.userName} size={32} />
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="px-2.5 pt-1 pb-2">
              <p className="truncate text-[13px] font-semibold text-ink-900">{settings.userName}</p>
              <p className="truncate text-xs text-ink-500">{settings.userEmail}</p>
            </div>
            <div className="border-t border-line-soft pt-1">
              <MenuItem
                icon={<Settings size={15} />}
                onClick={() => {
                  navigate('settings')
                  close()
                }}
              >
                Settings
              </MenuItem>
              <MenuItem
                icon={usingClaude ? <Sparkles size={15} /> : <Info size={15} />}
                onClick={() => {
                  navigate('settings')
                  close()
                }}
              >
                AI engine: {usingClaude ? 'Claude API' : 'Built-in'}
              </MenuItem>
              <MenuItem
                icon={<RotateCcw size={15} />}
                onClick={() => {
                  setConfirm(true)
                  close()
                }}
              >
                Reset demo data
              </MenuItem>
            </div>
          </>
        )}
      </Popover>
      {confirm && (
        <ConfirmDialog
          title="Reset demo data?"
          body="This replaces every project in the workspace with the original sample portfolio. Your profile and AI settings are kept."
          confirmLabel="Reset data"
          onClose={() => setConfirm(false)}
          onConfirm={() => {
            useApp.getState().resetDemo()
            useApp.getState().toast('Demo data restored')
            navigate('dashboard')
          }}
        />
      )}
    </>
  )
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="no-print z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white px-3 sm:gap-3 sm:px-5">
      <button type="button" aria-label="Open menu" onClick={onMenu} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-900/5 lg:hidden">
        <Menu size={19} />
      </button>
      <GlobalSearch />
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <ProjectSwitcher />
        <Notifications />
        <UserMenu />
      </div>
    </header>
  )
}
