import { ChartGantt, CircleHelp, FileText, FolderKanban, LayoutDashboard, ListTree, Settings, ShieldAlert, Sparkles, SquareKanban, X, Zap } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { navigate, type Route } from '../router'
import { useApp, useProject } from '../store'
import { Avatar, Button, cx, Modal } from './ui'

const PLAN_PROJECT_LIMIT = 20

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="pp-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7650ff" />
          <stop offset="1" stopColor="#2f6bff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="url(#pp-logo)" />
      <path d="M8 17.2 23.5 8.5 19 23.5l-3.4-5.2z" fill="#fff" />
      <path d="m15.6 18.3 3.1-4.6" stroke="#6238f5" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function NavItem({ route, current, icon, children }: { route: Route; current: Route; icon: ReactNode; children: ReactNode }) {
  const active = route === current
  return (
    <a
      href={`#/${route}`}
      onClick={(e) => {
        e.preventDefault()
        navigate(route)
      }}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors',
        active ? 'bg-white/10 text-white' : 'text-navy-300 hover:bg-white/5 hover:text-white',
      )}
    >
      {active && <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r bg-brand-400" />}
      <span className={cx('shrink-0', active ? 'text-brand-300' : 'text-navy-400 group-hover:text-navy-300')}>{icon}</span>
      <span className="truncate">{children}</span>
    </a>
  )
}

export function Sidebar({ route, open, onClose }: { route: Route; open: boolean; onClose: () => void }) {
  const settings = useApp((s) => s.settings)
  const count = useApp((s) => s.projects.length)
  const project = useProject()
  const [dialog, setDialog] = useState<'plan' | 'help' | null>(null)

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-navy-950/50 lg:hidden" onClick={onClose} />}
      <aside
        className={cx(
          'on-navy no-print fixed inset-y-0 left-0 z-50 flex w-[248px] shrink-0 flex-col bg-navy-900 text-white transition-transform duration-200 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2.5 px-4">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">ProjectPilot</span>
          <span className="rounded bg-brand-500/25 px-1.5 py-px text-[11px] font-semibold text-brand-200">AI</span>
          <button type="button" aria-label="Close menu" onClick={onClose} className="ml-auto rounded p-1 text-navy-300 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Main">
          <div className="space-y-0.5">
            <NavItem route="dashboard" current={route} icon={<LayoutDashboard size={17} />}>Dashboard</NavItem>
            <NavItem route="projects" current={route} icon={<FolderKanban size={17} />}>My Projects</NavItem>
            <NavItem route="generator" current={route} icon={<Sparkles size={17} />}>AI Project Generator</NavItem>
          </div>

          <div>
            <p className="mb-1.5 truncate px-2.5 text-xs text-navy-400" title={project?.name}>
              {project ? project.name : 'No project selected'}
            </p>
            <div className="space-y-0.5">
              <NavItem route="wbs" current={route} icon={<ListTree size={17} />}>WBS Builder</NavItem>
              <NavItem route="board" current={route} icon={<SquareKanban size={17} />}>Task Board</NavItem>
              <NavItem route="gantt" current={route} icon={<ChartGantt size={17} />}>Gantt Timeline</NavItem>
              <NavItem route="risks" current={route} icon={<ShieldAlert size={17} />}>Risk Analysis</NavItem>
              <NavItem route="reports" current={route} icon={<FileText size={17} />}>Reports</NavItem>
            </div>
          </div>

          <div className="space-y-0.5">
            <NavItem route="settings" current={route} icon={<Settings size={17} />}>Settings</NavItem>
          </div>
        </nav>

        <div className="space-y-2 border-t border-white/8 p-3">
          <button
            type="button"
            onClick={() => setDialog('plan')}
            className="w-full rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 text-left transition-colors hover:bg-white/8"
          >
            <span className="flex items-center justify-between text-[13px] font-medium">
              <span className="flex items-center gap-1.5">
                <Zap size={14} className="text-brand-300" /> Pro plan
              </span>
              <span className="tnum text-xs text-navy-300">
                {count} / {PLAN_PROJECT_LIMIT} projects
              </span>
            </span>
            <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-brand-400" style={{ width: `${Math.min(100, (count / PLAN_PROJECT_LIMIT) * 100)}%` }} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setDialog('help')}
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-navy-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            <CircleHelp size={17} className="text-navy-400" /> Help and support
          </button>

          <button
            type="button"
            onClick={() => navigate('settings')}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
          >
            <Avatar name={settings.userName} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{settings.userName}</span>
              <span className="block truncate text-xs text-navy-400">{settings.userRole}</span>
            </span>
          </button>
        </div>
      </aside>

      {dialog === 'plan' && (
        <Modal title="Subscription" description={`${settings.workspace} workspace`} onClose={() => setDialog(null)} footer={<Button onClick={() => setDialog(null)}>Close</Button>}>
          <div className="space-y-4 text-sm text-ink-600">
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
              <p className="font-semibold text-ink-900">Pro plan</p>
              <p className="mt-1">
                {count} of {PLAN_PROJECT_LIMIT} projects used. Includes the AI Project Generator, risk analysis, the project assistant and PDF and CSV exports.
              </p>
            </div>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Unlimited tasks, risks and team members per project</li>
              <li>Built-in planning engine, with optional Claude API integration using your own key</li>
              <li>Workspace export and import</li>
            </ul>
            <p className="text-[13px] text-ink-500">
              This build stores everything in your browser and has no billing connected, so the plan shown here is illustrative.
            </p>
          </div>
        </Modal>
      )}

      {dialog === 'help' && (
        <Modal title="Help and support" description="How ProjectPilot AI fits together" onClose={() => setDialog(null)} width={600} footer={<Button onClick={() => setDialog(null)}>Close</Button>}>
          <div className="space-y-4 text-sm text-ink-600">
            <ol className="list-decimal space-y-2.5 pl-5">
              <li>
                <strong className="text-ink-900">Generate a plan.</strong> Describe a project in the AI Project Generator to get a charter, WBS, schedule, risk register and resource plan.
              </li>
              <li>
                <strong className="text-ink-900">Refine the WBS.</strong> Add, rename, reorder and delete phases and tasks; set owners, durations, priorities, dependencies and milestones.
              </li>
              <li>
                <strong className="text-ink-900">Adjust the timeline.</strong> Drag a bar in the Gantt timeline to move it, or drag its right edge to change the duration. Dependent tasks move with it.
              </li>
              <li>
                <strong className="text-ink-900">Run the work.</strong> Drag cards across the Task Board. Status and progress update everywhere.
              </li>
              <li>
                <strong className="text-ink-900">Watch risk and report.</strong> Risk Analysis scores the register and flags schedule risks; Reports exports a status report as PDF or CSV.
              </li>
            </ol>
            <div className="rounded-xl bg-canvas p-3.5 text-[13px]">
              <p className="font-medium text-ink-900">Good to know</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>All views read the same project data, so a change in one appears in the others immediately.</li>
                <li>Durations are working days, Monday to Friday.</li>
                <li>Press <kbd className="rounded border border-line bg-white px-1 text-xs">/</kbd> to search tasks, risks and projects.</li>
                <li>Data is saved in this browser. Use Settings → Data to export, import or reset the demo.</li>
                <li>The assistant button at the bottom right answers questions about the open project.</li>
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
