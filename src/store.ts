import { create } from 'zustand'
import type { Activity, ActivityKind, Charter, Project, Resource, Risk, Settings, Task, Workspace } from './types'
import { STATUS_LABEL } from './types'
import { blankTask } from './ai/generator'
import { repository } from './data/repository'
import { createSeedWorkspace, DEFAULT_SETTINGS, WORKSPACE_VERSION } from './data/seed'
import { fromWIdx, snapToWorkday, todayISO, wIdx } from './lib/dates'
import { clamp, PROJECT_COLORS, uid } from './lib/format'
import { nextRiskCode } from './lib/risk'
import { analyze, autoSchedule, cascade, descendantIds, wouldCycle } from './lib/schedule'

export interface Toast {
  id: string
  text: string
  tone: 'success' | 'error' | 'info'
}

interface AppState {
  ready: boolean
  projects: Project[]
  currentProjectId: string | null
  settings: Settings

  // Interface state — not persisted.
  drawerTaskId: string | null
  assistantOpen: boolean
  collapsed: Record<string, boolean>
  toasts: Toast[]

  init: () => Promise<void>
  setCurrent: (id: string) => void
  addProject: (p: Project) => void
  createBlankProject: (name: string) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  deleteProject: (id: string) => void
  duplicateProject: (id: string) => void
  updateCharter: (patch: Partial<Charter>) => void

  addTask: (opts: { parentId: string | null; afterId?: string; patch?: Partial<Task> }) => string | null
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  moveTask: (id: string, dir: -1 | 1) => void
  addDependency: (taskId: string, predId: string) => boolean
  removeDependency: (taskId: string, predId: string) => void
  autoSchedule: () => void

  addRisk: (patch?: Partial<Risk>) => string | null
  updateRisk: (id: string, patch: Partial<Risk>) => void
  deleteRisk: (id: string) => void

  addResource: (patch?: Partial<Resource>) => void
  updateResource: (id: string, patch: Partial<Resource>) => void
  deleteResource: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  resetDemo: () => void
  importWorkspace: (ws: Workspace) => void

  openTask: (id: string | null) => void
  setAssistantOpen: (open: boolean) => void
  toggleCollapsed: (id: string) => void
  setCollapsed: (ids: string[], value: boolean) => void
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
}

const log = (kind: ActivityKind, text: string): Activity => ({ id: uid('a_'), ts: Date.now(), kind, text })

/** Apply an edit and keep status and progress consistent with each other. */
function normalizeTask(prev: Task, patch: Partial<Task>): Task {
  const t = { ...prev, ...patch }
  if (patch.duration !== undefined) t.duration = clamp(Math.round(Number(patch.duration) || 0), 0, 500)
  if (patch.start) t.start = snapToWorkday(patch.start)
  if (patch.progress !== undefined) t.progress = clamp(Math.round(Number(patch.progress) || 0), 0, 100)
  if (patch.status !== undefined && patch.status !== prev.status) {
    if (t.status === 'done') t.progress = 100
    else if (t.status === 'backlog' || t.status === 'todo') t.progress = 0
    else if (t.status === 'review') t.progress = clamp(prev.progress, 90, 95)
    else t.progress = prev.progress >= 100 ? 75 : Math.max(prev.progress, 10)
  } else if (patch.progress !== undefined) {
    if (t.progress >= 100) t.status = 'done'
    else if (t.progress > 0 && (t.status === 'backlog' || t.status === 'todo' || t.status === 'done')) t.status = 'in_progress'
    else if (t.progress === 0 && t.status === 'done') t.status = 'todo'
  }
  return t
}

export const useApp = create<AppState>((set, get) => {
  /** Edit the current project. Return the same object to signal "no change". */
  const mutate = (fn: (p: Project) => Project, entry?: Activity) => {
    const { projects, currentProjectId } = get()
    const current = projects.find((p) => p.id === currentProjectId)
    if (!current) return
    let next = fn(current)
    if (next === current) return
    next = { ...next, updatedAt: Date.now(), activity: entry ? [entry, ...next.activity].slice(0, 60) : next.activity }
    set({ projects: projects.map((p) => (p.id === current.id ? next : p)) })
  }
  const current = () => get().projects.find((p) => p.id === get().currentProjectId) ?? null

  return {
    ready: false,
    projects: [],
    currentProjectId: null,
    settings: DEFAULT_SETTINGS,
    drawerTaskId: null,
    assistantOpen: false,
    collapsed: {},
    toasts: [],

    init: async () => {
      let ws = await repository.load()
      if (!ws || !ws.projects.length) {
        ws = createSeedWorkspace()
        await repository.save(ws)
      }
      set({ ready: true, projects: ws.projects, currentProjectId: ws.currentProjectId, settings: ws.settings })
    },

    setCurrent: (id) => set({ currentProjectId: id, drawerTaskId: null, collapsed: {} }),

    addProject: (p) => {
      const entry = log('plan', `Project plan created (${p.tasks.length} WBS items, ${p.risks.length} risks)`)
      set((s) => ({
        projects: [{ ...p, activity: [entry, ...p.activity] }, ...s.projects],
        currentProjectId: p.id,
        drawerTaskId: null,
        collapsed: {},
      }))
    },

    createBlankProject: (name) => {
      const start = snapToWorkday(todayISO())
      const now = Date.now()
      const phaseId = uid('t_')
      const p: Project = {
        id: uid('p_'),
        name: name.trim() || 'Untitled project',
        description: '',
        type: 'general',
        complexity: 'medium',
        start,
        targetEnd: fromWIdx(wIdx(start) + 39),
        teamSize: 1,
        budget: null,
        spent: 0,
        color: PROJECT_COLORS[get().projects.length % PROJECT_COLORS.length],
        source: 'manual',
        planNotes: [],
        createdAt: now,
        updatedAt: now,
        charter: {
          objective: '',
          justification: '',
          scope: [],
          outOfScope: [],
          deliverables: [],
          stakeholders: [],
          successCriteria: [],
          assumptions: [],
          constraints: [],
        },
        tasks: [
          blankTask(phaseId, null, 'Phase 1', start),
          { ...blankTask(uid('t_'), phaseId, 'First task', start), duration: 3, status: 'todo' },
        ],
        risks: [],
        resources: [{ id: uid('r_'), name: get().settings.userName, role: get().settings.userRole, allocation: 100 }],
        activity: [log('project', 'Project created')],
      }
      set((s) => ({ projects: [p, ...s.projects], currentProjectId: p.id, drawerTaskId: null, collapsed: {} }))
      return p.id
    },

    updateProject: (id, patch) =>
      set((s) => ({
        projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
      })),

    deleteProject: (id) =>
      set((s) => {
        const projects = s.projects.filter((p) => p.id !== id)
        return {
          projects,
          currentProjectId: s.currentProjectId === id ? (projects[0]?.id ?? null) : s.currentProjectId,
          drawerTaskId: null,
        }
      }),

    duplicateProject: (id) => {
      const src = get().projects.find((p) => p.id === id)
      if (!src) return
      // Fresh ids throughout, with every cross-reference remapped.
      const map = new Map<string, string>()
      const remap = (old: string, prefix: string) => {
        if (!map.has(old)) map.set(old, uid(prefix))
        return map.get(old)!
      }
      const resources = src.resources.map((r) => ({ ...r, id: remap(r.id, 'r_') }))
      const tasks = src.tasks.map((t) => ({ ...t, id: remap(t.id, 't_') }))
      const copy: Project = {
        ...src,
        id: uid('p_'),
        name: `${src.name} (copy)`,
        source: 'manual',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        resources,
        tasks: tasks.map((t, i) => ({
          ...t,
          parentId: src.tasks[i].parentId ? (map.get(src.tasks[i].parentId!) ?? null) : null,
          ownerId: t.ownerId ? (map.get(t.ownerId) ?? null) : null,
          dependencies: t.dependencies.map((d) => map.get(d)).filter((x): x is string => !!x),
        })),
        risks: src.risks.map((r) => ({ ...r, id: uid('k_'), ownerId: r.ownerId ? (map.get(r.ownerId) ?? null) : null })),
        activity: [log('project', `Duplicated from "${src.name}"`)],
      }
      set((s) => ({ projects: [copy, ...s.projects] }))
    },

    updateCharter: (patch) => mutate((p) => ({ ...p, charter: { ...p.charter, ...patch } })),

    addTask: ({ parentId, afterId, patch }) => {
      const p = current()
      if (!p) return null
      const a = analyze(p)
      const id = uid('t_')
      const parent = parentId ? a.byId.get(parentId) : null
      const today = snapToWorkday(todayISO())
      let task: Task
      if (!parentId) {
        // A new phase goes after everything already planned.
        task = { ...blankTask(id, null, 'New phase', fromWIdx(a.eIdx + 1)), duration: 5, status: 'backlog' }
      } else if (parent && !parent.isSummary) {
        // First subtask of a leaf takes over its dates, owner and progress so nothing shifts.
        const src = parent.task
        task = { ...blankTask(id, parentId, 'New subtask', src.start), duration: Math.max(src.duration, 1), ownerId: src.ownerId, status: src.status, progress: src.progress, priority: src.priority }
      } else {
        const start = parent ? (parent.sIdx > wIdx(today) ? parent.start : wIdx(today) > parent.eIdx ? parent.end : today) : today
        task = { ...blankTask(id, parentId, 'New task', start), duration: 2, status: 'todo' }
      }
      task = { ...task, ...patch, id, parentId }
      mutate((proj) => {
        const tasks = [...proj.tasks]
        const at = afterId ? tasks.findIndex((t) => t.id === afterId) : -1
        if (at >= 0) tasks.splice(at + 1, 0, task)
        else tasks.push(task)
        return { ...proj, tasks: cascade(tasks) }
      }, log('task', `${parentId ? 'Task' : 'Phase'} added: ${task.name}`))
      if (parentId) set((s) => ({ collapsed: { ...s.collapsed, [parentId]: false } }))
      return id
    },

    updateTask: (id, patch) => {
      const p = current()
      const prev = p?.tasks.find((t) => t.id === id)
      if (!p || !prev) return
      const row = analyze(p).byId.get(id)
      const summaryMove = !!row?.isSummary && !!patch.start
      const next = summaryMove ? null : normalizeTask(prev, patch)
      const label = `${row?.code ?? ''} ${prev.name}`.trim()
      const entry =
        next && next.status !== prev.status
          ? next.status === 'done'
            ? log(next.milestone ? 'milestone' : 'task', next.milestone ? `Milestone reached: ${next.name}` : `${label} completed`)
            : log('task', `${label} moved to ${STATUS_LABEL[next.status]}`)
          : undefined

      mutate((proj) => {
        let tasks = proj.tasks
        if (next) {
          tasks = tasks.map((t) => (t.id === id ? next : t))
        } else if (row) {
          // Moving a summary task moves all of its work by the same number of working days.
          const delta = wIdx(patch.start!) - row.sIdx
          const leafSet = new Set(row.leafIds)
          const rest = { ...patch }
          delete rest.start
          tasks = tasks.map((t) => {
            if (leafSet.has(t.id) && delta) return { ...t, start: fromWIdx(wIdx(t.start) + delta) }
            return t.id === id ? { ...t, ...rest } : t
          })
        }
        if (patch.start !== undefined || patch.duration !== undefined || patch.dependencies !== undefined) tasks = cascade(tasks)
        return { ...proj, tasks }
      }, entry)
    },

    deleteTask: (id) => {
      const p = current()
      const t = p?.tasks.find((x) => x.id === id)
      if (!p || !t) return
      const gone = new Set([id, ...descendantIds(p.tasks, id)])
      mutate(
        (proj) => ({
          ...proj,
          tasks: proj.tasks
            .filter((x) => !gone.has(x.id))
            .map((x) => (x.dependencies.some((d) => gone.has(d)) ? { ...x, dependencies: x.dependencies.filter((d) => !gone.has(d)) } : x)),
        }),
        log('task', `${t.parentId ? 'Task' : 'Phase'} deleted: ${t.name}`),
      )
      if (get().drawerTaskId && gone.has(get().drawerTaskId!)) set({ drawerTaskId: null })
    },

    moveTask: (id, dir) =>
      mutate((proj) => {
        const t = proj.tasks.find((x) => x.id === id)
        if (!t) return proj
        const siblings = proj.tasks.filter((x) => x.parentId === t.parentId)
        const other = siblings[siblings.indexOf(t) + dir]
        if (!other) return proj
        const tasks = [...proj.tasks]
        const i = tasks.indexOf(t)
        const j = tasks.indexOf(other)
        tasks[i] = other
        tasks[j] = t
        return { ...proj, tasks }
      }),

    addDependency: (taskId, predId) => {
      const p = current()
      const t = p?.tasks.find((x) => x.id === taskId)
      if (!p || !t || t.dependencies.includes(predId)) return false
      if (wouldCycle(p.tasks, taskId, predId)) {
        get().toast('That dependency would create a loop, so it was not added.', 'error')
        return false
      }
      get().updateTask(taskId, { dependencies: [...t.dependencies, predId] })
      return true
    },

    removeDependency: (taskId, predId) => {
      const t = current()?.tasks.find((x) => x.id === taskId)
      if (t) get().updateTask(taskId, { dependencies: t.dependencies.filter((d) => d !== predId) })
    },

    autoSchedule: () =>
      mutate((proj) => {
        const tasks = autoSchedule(proj.tasks, proj.start)
        return tasks === proj.tasks ? proj : { ...proj, tasks }
      }, log('plan', 'Schedule recalculated from dependencies')),

    addRisk: (patch) => {
      const p = current()
      if (!p) return null
      const risk: Risk = {
        id: uid('k_'),
        code: nextRiskCode(p.risks),
        description: 'New risk',
        category: 'General',
        probability: 3,
        impact: 3,
        ownerId: null,
        mitigation: '',
        status: 'open',
        ...patch,
      }
      mutate((proj) => ({ ...proj, risks: [...proj.risks, risk] }), log('risk', `Risk ${risk.code} added: ${risk.description}`))
      return risk.id
    },

    updateRisk: (id, patch) =>
      mutate((proj) => ({
        ...proj,
        risks: proj.risks.map((r) =>
          r.id === id
            ? { ...r, ...patch, probability: clamp(patch.probability ?? r.probability, 1, 5), impact: clamp(patch.impact ?? r.impact, 1, 5) }
            : r,
        ),
      })),

    deleteRisk: (id) => {
      const r = current()?.risks.find((x) => x.id === id)
      if (r) mutate((proj) => ({ ...proj, risks: proj.risks.filter((x) => x.id !== id) }), log('risk', `Risk ${r.code} removed`))
    },

    addResource: (patch) =>
      mutate((proj) => ({
        ...proj,
        resources: [...proj.resources, { id: uid('r_'), name: 'New team member', role: 'Team Member', allocation: 100, ...patch }],
      })),

    updateResource: (id, patch) =>
      mutate((proj) => ({
        ...proj,
        resources: proj.resources.map((r) =>
          r.id === id ? { ...r, ...patch, allocation: clamp(Math.round(patch.allocation ?? r.allocation), 5, 100) } : r,
        ),
      })),

    deleteResource: (id) =>
      mutate((proj) => ({
        ...proj,
        resources: proj.resources.filter((r) => r.id !== id),
        tasks: proj.tasks.map((t) => (t.ownerId === id ? { ...t, ownerId: null } : t)),
        risks: proj.risks.map((r) => (r.ownerId === id ? { ...r, ownerId: null } : r)),
      })),

    updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

    resetDemo: () => {
      const ws = createSeedWorkspace()
      set((s) => ({
        projects: ws.projects,
        currentProjectId: ws.currentProjectId,
        // Keep the person's profile and AI settings; only project data is replaced.
        settings: { ...s.settings, notificationsSeenAt: 0 },
        drawerTaskId: null,
        collapsed: {},
      }))
    },

    importWorkspace: (ws) =>
      set({ projects: ws.projects, currentProjectId: ws.currentProjectId, settings: ws.settings, drawerTaskId: null, collapsed: {} }),

    openTask: (id) => set({ drawerTaskId: id }),
    setAssistantOpen: (open) => set({ assistantOpen: open }),
    toggleCollapsed: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),
    setCollapsed: (ids, value) => set((s) => ({ collapsed: { ...s.collapsed, ...Object.fromEntries(ids.map((i) => [i, value])) } })),

    toast: (text, tone = 'success') => {
      const id = uid('n_')
      set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }))
      setTimeout(() => get().dismissToast(id), tone === 'error' ? 7000 : 3500)
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }
})

// Persist project data and settings (never interface state) shortly after each change.
let timer: ReturnType<typeof setTimeout> | undefined
useApp.subscribe((s, prev) => {
  if (!s.ready) return
  if (s.projects === prev.projects && s.currentProjectId === prev.currentProjectId && s.settings === prev.settings) return
  clearTimeout(timer)
  timer = setTimeout(() => {
    const { projects, currentProjectId, settings } = useApp.getState()
    repository.save({ version: WORKSPACE_VERSION, projects, currentProjectId, settings }).catch(() => {
      useApp.getState().toast('Could not save changes — browser storage is full or unavailable.', 'error')
    })
  }, 250)
})

export const useProject = (): Project | null => useApp((s) => s.projects.find((p) => p.id === s.currentProjectId) ?? null)
