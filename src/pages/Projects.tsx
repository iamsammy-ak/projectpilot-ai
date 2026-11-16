import { CalendarDays, ChartGantt, Copy, Ellipsis, FolderKanban, ListChecks, ListTree, Plus, Search, Sparkles, Trash2, TriangleAlert, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  cx,
  Empty,
  Field,
  HealthBadge,
  IconButton,
  inputCls,
  MenuItem,
  Modal,
  PageHeader,
  Popover,
  Progress,
  Segmented,
  SourceBadge,
} from '../components/ui'
import { fmtLong } from '../lib/dates'
import { plural } from '../lib/format'
import { analyze, type Analysis } from '../lib/schedule'
import { navigate, type Route } from '../router'
import { useApp } from '../store'
import type { Project } from '../types'
import { PROJECT_TYPE_LABEL } from '../types'

type Filter = 'all' | 'active' | 'completed'

const progressTone = (a: Analysis) =>
  a.health.label === 'Completed' ? 'green' : a.health.label === 'Off Track' ? 'red' : a.health.label === 'At Risk' ? 'amber' : 'brand'

export default function Projects() {
  const projects = useApp((s) => s.projects)
  const currentId = useApp((s) => s.currentProjectId)
  const setCurrent = useApp((s) => s.setCurrent)
  const createBlankProject = useApp((s) => s.createBlankProject)
  const duplicateProject = useApp((s) => s.duplicateProject)
  const deleteProject = useApp((s) => s.deleteProject)
  const toast = useApp((s) => s.toast)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [deleting, setDeleting] = useState<Project | null>(null)

  const items = useMemo(() => projects.map((p) => ({ p, a: analyze(p) })), [projects])
  const completed = items.filter((x) => x.a.health.label === 'Completed').length
  const q = query.trim().toLowerCase()
  const shown = items.filter(({ p, a }) => {
    const done = a.health.label === 'Completed'
    if (filter === 'active' && done) return false
    if (filter === 'completed' && !done) return false
    if (!q) return true
    return `${p.name} ${p.description} ${PROJECT_TYPE_LABEL[p.type]}`.toLowerCase().includes(q)
  })

  const open = (id: string, route: Route) => {
    setCurrent(id)
    navigate(route)
  }

  const create = () => {
    createBlankProject(name)
    setCreating(false)
    setName('')
    navigate('wbs')
  }

  return (
    <div>
      <PageHeader
        title="My Projects"
        description={`${plural(projects.length, 'project')} in this workspace, ${completed} completed. Open one to work on its plan.`}
        actions={
          <>
            <Button icon={<Plus size={15} />} onClick={() => setCreating(true)}>
              Blank project
            </Button>
            <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => navigate('generator')}>
              Generate with AI
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            aria-label="Search projects"
            placeholder="Search projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={cx(inputCls, 'pl-9')}
          />
        </div>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: `All ${projects.length}` },
            { value: 'active', label: `Active ${projects.length - completed}` },
            { value: 'completed', label: `Completed ${completed}` },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <Card>
          {projects.length === 0 ? (
            <Empty
              icon={<FolderKanban size={20} />}
              title="No projects yet"
              action={
                <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => navigate('generator')}>
                  Generate a project plan
                </Button>
              }
            >
              Describe a project and the generator builds its charter, WBS, schedule, risks and resource plan.
            </Empty>
          ) : (
            <Empty
              icon={<Search size={20} />}
              title="No projects match"
              action={
                <Button
                  onClick={() => {
                    setQuery('')
                    setFilter('all')
                  }}
                >
                  Clear search and filter
                </Button>
              }
            >
              Nothing matches {q ? `“${query.trim()}”` : 'this filter'}. Try a different name or show all projects.
            </Empty>
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(({ p, a }) => {
            const isCurrent = p.id === currentId
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${p.name}`}
                onClick={() => open(p.id, 'wbs')}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    open(p.id, 'wbs')
                  }
                }}
                className={cx(
                  'flex cursor-pointer flex-col rounded-xl border bg-white p-4 shadow-card transition-colors hover:border-ink-300',
                  isCurrent ? 'border-brand-300' : 'border-line',
                )}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[15px] leading-snug font-semibold text-ink-900">{p.name}</h2>
                    <p className="mt-0.5 text-[13px] text-ink-500">{PROJECT_TYPE_LABEL[p.type]}</p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <Popover
                      align="right"
                      width={190}
                      trigger={(_open, toggle) => (
                        <IconButton label={`Actions for ${p.name}`} onClick={toggle}>
                          <Ellipsis size={16} />
                        </IconButton>
                      )}
                    >
                      {(close) => (
                        <>
                          <MenuItem
                            icon={<ListTree size={14} />}
                            onClick={() => {
                              close()
                              open(p.id, 'wbs')
                            }}
                          >
                            Open WBS
                          </MenuItem>
                          <MenuItem
                            icon={<ChartGantt size={14} />}
                            onClick={() => {
                              close()
                              open(p.id, 'gantt')
                            }}
                          >
                            Open Gantt
                          </MenuItem>
                          <MenuItem
                            icon={<Copy size={14} />}
                            onClick={() => {
                              close()
                              duplicateProject(p.id)
                              toast(`Duplicated “${p.name}”`)
                            }}
                          >
                            Duplicate
                          </MenuItem>
                          <MenuItem
                            danger
                            icon={<Trash2 size={14} />}
                            onClick={() => {
                              close()
                              setDeleting(p)
                            }}
                          >
                            Delete
                          </MenuItem>
                        </>
                      )}
                    </Popover>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <HealthBadge label={a.health.label} />
                  {isCurrent && <Badge tone="brand">Current project</Badge>}
                </div>

                <p className="mt-2.5 line-clamp-2 min-h-10 text-[13px] leading-5 text-ink-600">
                  {p.description || 'No description yet. Add one under Settings.'}
                </p>

                <div className="mt-3">
                  <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
                    <span className="text-ink-500">Progress</span>
                    <span className="tnum font-semibold text-ink-900">{a.percent}%</span>
                  </div>
                  <Progress value={a.percent} tone={progressTone(a)} />
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink-600">
                  <div className="inline-flex items-center gap-1.5" title="Planned finish">
                    <CalendarDays size={14} className="text-ink-400" />
                    <dt className="sr-only">Planned finish</dt>
                    <dd>{fmtLong(a.end)}</dd>
                  </div>
                  <div className="inline-flex items-center gap-1.5" title="Tasks completed">
                    <ListChecks size={14} className="text-ink-400" />
                    <dt className="sr-only">Tasks completed</dt>
                    <dd className="tnum">
                      {a.counts.done} of {a.leaves.length} tasks
                    </dd>
                  </div>
                  <div className="inline-flex items-center gap-1.5" title="Team size">
                    <Users size={14} className="text-ink-400" />
                    <dt className="sr-only">Team size</dt>
                    <dd className="tnum">{p.resources.length || p.teamSize}</dd>
                  </div>
                  {a.overdue.length > 0 && (
                    <div className="inline-flex items-center gap-1.5 text-red-700">
                      <TriangleAlert size={14} />
                      <dt className="sr-only">Overdue</dt>
                      <dd className="tnum">{a.overdue.length} overdue</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-3 border-t border-line-soft pt-3">
                  <SourceBadge source={p.source} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {creating && (
        <Modal
          title="Blank project"
          description="Starts with one phase and one task. Build the rest in the WBS Builder."
          width={440}
          onClose={() => setCreating(false)}
          footer={
            <>
              <Button onClick={() => setCreating(false)}>Cancel</Button>
              <Button variant="primary" onClick={create} disabled={!name.trim()}>
                Create project
              </Button>
            </>
          }
        >
          <Field label="Project name">
            <input
              autoFocus
              value={name}
              placeholder="e.g. Office relocation"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()}
              className={inputCls}
            />
          </Field>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete project"
          body={`“${deleting.name}” and its ${plural(deleting.tasks.length, 'WBS item')}, risks and team will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete project"
          onConfirm={() => {
            deleteProject(deleting.id)
            toast(`Deleted “${deleting.name}”`)
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
