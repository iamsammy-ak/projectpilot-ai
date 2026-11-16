import { CircleCheck, Cpu, Download, Eye, EyeOff, FolderKanban, Info, LoaderCircle, Plus, RotateCcw, Sparkles, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AIError, CLAUDE_MODELS, testConnection } from '../ai/claude'
import { workload } from '../ai/insights'
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  cx,
  Empty,
  Field,
  IconButton,
  InlineNumber,
  InlineText,
  inputCls,
  PageHeader,
  Segmented,
  textareaCls,
} from '../components/ui'
import { normalize } from '../data/repository'
import { WORKSPACE_VERSION } from '../data/seed'
import { fmtLong, todayISO } from '../lib/dates'
import { download, plural, PROJECT_COLORS } from '../lib/format'
import { navigate } from '../router'
import { useApp, useProject } from '../store'
import type { Complexity, Project, ProjectType, Resource, Workspace } from '../types'
import { COMPLEXITY_LABEL, PROJECT_TYPE_LABEL } from '../types'

type Tab = 'profile' | 'project' | 'team' | 'ai' | 'data'

const TABS: { value: Tab; label: string }[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'project', label: 'Project' },
  { value: 'team', label: 'Team' },
  { value: 'ai', label: 'AI engine' },
  { value: 'data', label: 'Data' },
]

export default function Settings() {
  const [tab, setTab] = useState<Tab>('profile')
  const project = useProject()
  return (
    <div>
      <PageHeader title="Settings" description="Your profile, the current project and its team, the AI engine and workspace data." />
      <div className="mb-5 max-w-full overflow-x-auto">
        <Segmented<Tab> value={tab} onChange={setTab} options={TABS} />
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'project' && (project ? <ProjectTab key={project.id} p={project} /> : <NoProject />)}
      {tab === 'team' && (project ? <TeamTab p={project} /> : <NoProject />)}
      {tab === 'ai' && <AITab />}
      {tab === 'data' && <DataTab />}
    </div>
  )
}

function NoProject() {
  return (
    <Card className="max-w-[640px]">
      <Empty
        icon={<FolderKanban size={20} />}
        title="No project selected"
        action={
          <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => navigate('generator')}>
            Generate a project plan
          </Button>
        }
      >
        Create or open a project to edit its details and team.
      </Empty>
    </Card>
  )
}

/* ───────────────────────────── Profile ───────────────────────────── */

function ProfileTab() {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  return (
    <Card className="max-w-[640px]">
      <CardHeader title="Profile" hint="Shown in the sidebar and on exported reports." />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field label="Name">
          <input className={inputCls} value={settings.userName} onChange={(e) => update({ userName: e.target.value })} autoComplete="name" />
        </Field>
        <Field label="Email">
          <input type="email" className={inputCls} value={settings.userEmail} onChange={(e) => update({ userEmail: e.target.value })} autoComplete="email" />
        </Field>
        <Field label="Role">
          <input className={inputCls} value={settings.userRole} onChange={(e) => update({ userRole: e.target.value })} />
        </Field>
        <Field label="Workspace name">
          <input className={inputCls} value={settings.workspace} onChange={(e) => update({ workspace: e.target.value })} />
        </Field>
      </div>
    </Card>
  )
}

/* ───────────────────────────── Project ───────────────────────────── */

function ProjectTab({ p }: { p: Project }) {
  const updateProject = useApp((s) => s.updateProject)
  const set = (patch: Partial<Project>) => updateProject(p.id, patch)
  const overBudget = p.budget != null && p.spent > p.budget
  return (
    <Card className="max-w-[640px]">
      <CardHeader title="Project details" hint="Changes apply to the project currently selected in the top bar." />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field label="Project name" className="sm:col-span-2">
          <input
            className={inputCls}
            value={p.name}
            onChange={(e) => set({ name: e.target.value })}
            onBlur={() => !p.name.trim() && set({ name: 'Untitled project' })}
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea className={textareaCls} rows={3} value={p.description} onChange={(e) => set({ description: e.target.value })} placeholder="What the project delivers and why it matters" />
        </Field>
        <Field label="Project type">
          <select className={inputCls} value={p.type} onChange={(e) => set({ type: e.target.value as ProjectType })}>
            {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) => (
              <option key={t} value={t}>
                {PROJECT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Complexity">
          <select className={inputCls} value={p.complexity} onChange={(e) => set({ complexity: e.target.value as Complexity })}>
            {(Object.keys(COMPLEXITY_LABEL) as Complexity[]).map((c) => (
              <option key={c} value={c}>
                {COMPLEXITY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="mb-1 block text-[13px] font-medium text-ink-700">Start date</span>
          <div className="flex h-9 items-center rounded-lg border border-line bg-canvas px-3 text-sm text-ink-600">{fmtLong(p.start)}</div>
          <p className="mt-1 text-xs text-ink-500">Set when the plan was created. To move work, drag tasks in the Gantt timeline.</p>
        </div>
        <Field label="Target completion">
          <input type="date" className={inputCls} value={p.targetEnd} min={p.start} onChange={(e) => e.target.value && set({ targetEnd: e.target.value })} />
        </Field>
        <Field label="Budget (USD)" hint="Leave blank for none">
          <input
            type="number"
            min={0}
            step={1000}
            className={cx(inputCls, 'tnum')}
            value={p.budget ?? ''}
            placeholder="No budget"
            onChange={(e) => set({ budget: e.target.value === '' ? null : Math.max(0, Number(e.target.value) || 0) })}
          />
        </Field>
        <div>
          <Field label="Actual spend (USD)">
            <input
              type="number"
              min={0}
              step={500}
              className={cx(inputCls, 'tnum')}
              value={p.spent}
              onChange={(e) => set({ spent: Math.max(0, Number(e.target.value) || 0) })}
            />
          </Field>
          {overBudget && (
            <p className="mt-1 flex items-center gap-1 text-xs text-red-700">
              <TriangleAlert size={12} /> Spend is above the budget.
            </p>
          )}
        </div>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-700">Colour</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Project colour">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={p.color === c}
                aria-label={`Colour ${c}`}
                onClick={() => set({ color: c })}
                className={cx(
                  'h-7 w-7 rounded-full ring-offset-2 transition-shadow',
                  p.color === c ? 'ring-2 ring-ink-900' : 'hover:ring-2 hover:ring-ink-300',
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ───────────────────────────── Team ───────────────────────────── */

function TeamTab({ p }: { p: Project }) {
  const addResource = useApp((s) => s.addResource)
  const updateResource = useApp((s) => s.updateResource)
  const deleteResource = useApp((s) => s.deleteResource)
  const toast = useApp((s) => s.toast)
  const [removing, setRemoving] = useState<Resource | null>(null)
  const loads = useMemo(() => workload(p), [p])
  const th = 'px-3 py-2 text-left text-xs font-medium text-ink-500'
  const removingLoad = removing ? loads.find((l) => l.resource.id === removing.id) : undefined

  return (
    <Card className="max-w-4xl">
      <CardHeader
        title="Team"
        hint={`People assigned to ${p.name}. Allocation is the share of each week they give this project.`}
        action={
          <Button size="sm" icon={<Plus size={14} />} onClick={() => addResource()}>
            Add team member
          </Button>
        }
      />
      {p.resources.length === 0 ? (
        <Empty
          title="No team members yet"
          action={
            <Button variant="primary" icon={<Plus size={15} />} onClick={() => addResource()}>
              Add team member
            </Button>
          }
        >
          Add the people working on this project so tasks and risks can be assigned to them.
        </Empty>
      ) : (
        <div className="overflow-x-auto border-t border-line-soft">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-line-soft">
                <th className={cx(th, 'pl-5')}>Name</th>
                <th className={th}>Role</th>
                <th className={cx(th, 'w-32')}>Weekly allocation</th>
                <th className={cx(th, 'w-24 text-right')}>Open tasks</th>
                <th className={cx(th, 'w-24 text-right')}>Days left</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {loads.map((l) => {
                const r = l.resource
                return (
                  <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60">
                    <td className="py-1.5 pr-3 pl-5">
                      <div className="flex items-center gap-2">
                        <Avatar name={r.name} size={24} />
                        <InlineText value={r.name} placeholder="Name" onCommit={(v) => v && updateResource(r.id, { name: v })} className="font-medium" />
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      <InlineText value={r.role} placeholder="Role" onCommit={(v) => v && updateResource(r.id, { role: v })} />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        <InlineNumber value={r.allocation} min={5} max={100} label={`Weekly allocation for ${r.name}`} onCommit={(v) => updateResource(r.id, { allocation: v })} className="w-16" />
                        <span className="text-[13px] text-ink-500">%</span>
                      </div>
                    </td>
                    <td className="tnum px-3 py-1.5 text-right text-[13px] text-ink-700">{l.openCount}</td>
                    <td className="tnum px-3 py-1.5 text-right text-[13px] text-ink-700">
                      {l.remainingDays}
                      {l.overWeeks.length > 0 && (
                        <span className="ml-1.5 inline-flex align-middle text-amber-600" title={`Over-allocated in ${plural(l.overWeeks.length, 'week')}`}>
                          <TriangleAlert size={13} />
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <IconButton label={`Remove ${r.name}`} onClick={() => setRemoving(r)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title="Remove team member"
          body={`${removing.name} will be removed from this project. ${
            removingLoad?.taskCount ? `Their ${plural(removingLoad.taskCount, 'task')} and any risks they own become unassigned.` : 'They have no tasks assigned.'
          }`}
          confirmLabel="Remove"
          onConfirm={() => {
            deleteResource(removing.id)
            toast(`Removed ${removing.name}`)
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </Card>
  )
}

/* ───────────────────────────── AI engine ───────────────────────────── */

function EngineOption({ selected, onSelect, icon, title, children }: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cx(
        'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors',
        selected ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/15' : 'border-line bg-white hover:border-ink-300',
      )}
    >
      <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-brand-600 text-white' : 'bg-canvas text-ink-500')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          {title}
          {selected && <CircleCheck size={15} className="text-brand-600" />}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-600">{children}</span>
      </span>
    </button>
  )
}

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok'; model: string } | { status: 'error'; message: string }

function AITab() {
  const settings = useApp((s) => s.settings)
  const update = useApp((s) => s.updateSettings)
  const [show, setShow] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const usingClaude = settings.aiProvider === 'claude'
  const hasKey = settings.apiKey.trim().length > 0

  // A result only describes the key and model it was run with.
  useEffect(() => setTest({ status: 'idle' }), [settings.apiKey, settings.model])

  const run = async () => {
    setTest({ status: 'testing' })
    try {
      const model = await testConnection(settings)
      setTest({ status: 'ok', model })
    } catch (e) {
      setTest({ status: 'error', message: e instanceof AIError || e instanceof Error ? e.message : 'The connection test failed.' })
    }
  }

  return (
    <div className="max-w-[640px] space-y-4">
      <Card>
        <CardHeader title="AI engine" hint="Used by the AI Project Generator and the project assistant." />
        <div className="space-y-3 px-5 pb-5" role="radiogroup" aria-label="AI engine">
          <EngineOption selected={!usingClaude} onSelect={() => update({ aiProvider: 'engine' })} icon={<Cpu size={16} />} title="Built-in planning engine">
            Works offline and gives the same plan for the same inputs. It builds plans from project-type templates and answers questions with rules over your project data. Nothing leaves this browser.
          </EngineOption>
          <EngineOption selected={usingClaude} onSelect={() => update({ aiProvider: 'claude' })} icon={<Sparkles size={16} />} title="Claude API">
            Plans and answers are written by Claude. Requires your own Anthropic API key, and usage is billed to that key.
          </EngineOption>
        </div>
      </Card>

      {usingClaude && (
        <Card>
          <CardHeader title="Claude connection" />
          <div className="space-y-4 px-5 pb-5">
            {!hasKey && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
                <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                <span>No API key is set. The built-in planning engine is used until you add one.</span>
              </div>
            )}
            <Field label="Anthropic API key">
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  className={cx(inputCls, 'pr-10 font-mono text-[13px]')}
                  value={settings.apiKey}
                  placeholder="sk-ant-…"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => update({ apiKey: e.target.value })}
                />
                <IconButton label={show ? 'Hide API key' : 'Show API key'} onClick={() => setShow((v) => !v)} className="absolute top-1 right-1">
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </IconButton>
              </div>
            </Field>
            <Field label="Model">
              <select className={inputCls} value={settings.model} onChange={(e) => update({ model: e.target.value })}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={run} disabled={!hasKey || test.status === 'testing'} icon={test.status === 'testing' ? <LoaderCircle size={15} className="animate-spin" /> : undefined}>
                {test.status === 'testing' ? 'Testing connection' : 'Test connection'}
              </Button>
              <div aria-live="polite" className="min-w-0 flex-1 text-[13px]">
                {test.status === 'ok' && (
                  <span className="inline-flex items-start gap-1.5 text-emerald-700">
                    <CircleCheck size={15} className="mt-0.5 shrink-0" />
                    Connected. This key can use {test.model}.
                  </span>
                )}
                {test.status === 'error' && (
                  <span className="inline-flex items-start gap-1.5 text-red-700">
                    <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                    {test.message}
                  </span>
                )}
              </div>
            </div>
            <ul className="space-y-1.5 border-t border-line-soft pt-4 text-[13px] leading-relaxed text-ink-600">
              <li className="flex gap-2">
                <Info size={14} className="mt-1 shrink-0 text-ink-400" />
                The key is stored only in this browser’s local storage. It is left out of workspace exports.
              </li>
              <li className="flex gap-2">
                <Info size={14} className="mt-1 shrink-0 text-ink-400" />
                Requests go directly from this browser to api.anthropic.com. There is no ProjectPilot server in between.
              </li>
              <li className="flex gap-2">
                <Info size={14} className="mt-1 shrink-0 text-ink-400" />
                If a request fails, the app tells you why and uses the built-in engine instead. A failed request is never shown as a Claude result.
              </li>
            </ul>
          </div>
        </Card>
      )}
    </div>
  )
}

/* ───────────────────────────── Data ───────────────────────────── */

function DataRow({ title, children, action }: { title: string; children: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line-soft px-5 py-4">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-sm font-medium text-ink-900">{title}</p>
        <p className="mt-0.5 text-[13px] text-ink-500">{children}</p>
      </div>
      {action}
    </div>
  )
}

function DataTab() {
  const projects = useApp((s) => s.projects)
  const currentProjectId = useApp((s) => s.currentProjectId)
  const settings = useApp((s) => s.settings)
  const importWorkspace = useApp((s) => s.importWorkspace)
  const resetDemo = useApp((s) => s.resetDemo)
  const toast = useApp((s) => s.toast)
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Workspace | null>(null)
  const [resetting, setResetting] = useState(false)

  const sizeKB = useMemo(
    () => Math.max(1, Math.round(new Blob([JSON.stringify({ projects, currentProjectId, settings })]).size / 1024)),
    [projects, currentProjectId, settings],
  )

  const exportWorkspace = () => {
    const data: Workspace = { version: WORKSPACE_VERSION, projects, currentProjectId, settings: { ...settings, apiKey: '' } }
    download(`projectpilot-workspace-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json')
    toast('Exported workspace')
  }

  const onFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    try {
      const ws = normalize(JSON.parse(await file.text()))
      if (!ws || !ws.projects.length) throw new Error('invalid')
      setPending(ws)
    } catch {
      toast('That file is not a ProjectPilot workspace export, so nothing was imported.', 'error')
    }
  }

  return (
    <Card className="max-w-[640px]">
      <CardHeader title="Workspace data" hint={`${plural(projects.length, 'project')}, about ${sizeKB.toLocaleString('en-US')} KB of browser storage used.`} />
      <DataRow
        title="Export workspace"
        action={
          <Button icon={<Download size={15} />} onClick={exportWorkspace}>
            Export workspace
          </Button>
        }
      >
        Download every project and your settings as a JSON file. The API key is not included.
      </DataRow>
      <DataRow
        title="Import workspace"
        action={
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
              Import workspace
            </Button>
          </>
        }
      >
        Load a previously exported file. It replaces the projects currently in this browser.
      </DataRow>
      <DataRow
        title="Reset demo data"
        action={
          <Button variant="danger" icon={<RotateCcw size={15} />} onClick={() => setResetting(true)}>
            Reset demo data
          </Button>
        }
      >
        Restore the five sample projects with dates recalculated from today. Your profile and AI settings are kept.
      </DataRow>

      {pending && (
        <ConfirmDialog
          title="Replace workspace"
          body={`Importing replaces the ${plural(projects.length, 'project')} in this browser with the ${plural(pending.projects.length, 'project')} in the file. Export first if you want to keep the current data.`}
          confirmLabel="Replace workspace"
          onConfirm={() => {
            // Exports never contain the key, so keep the one already in this browser.
            importWorkspace({ ...pending, settings: { ...pending.settings, apiKey: pending.settings.apiKey || settings.apiKey } })
            toast(`Imported ${plural(pending.projects.length, 'project')}`)
          }}
          onClose={() => setPending(null)}
        />
      )}
      {resetting && (
        <ConfirmDialog
          title="Reset demo data"
          body="All projects in this browser, including any you created or edited, are replaced with the original sample projects. This cannot be undone."
          confirmLabel="Reset demo data"
          onConfirm={() => {
            resetDemo()
            toast('Demo data restored')
          }}
          onClose={() => setResetting(false)}
        />
      )}
    </Card>
  )
}
