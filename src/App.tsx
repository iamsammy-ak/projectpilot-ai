import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { Assistant } from './components/Assistant'
import { Sidebar } from './components/Sidebar'
import { TaskDrawer } from './components/TaskDrawer'
import { Topbar } from './components/Topbar'
import { Toasts } from './components/ui'
import { useRoute, type Route } from './router'
import { useApp } from './store'

// Each page is its own chunk, so the first paint only loads what the current route needs.
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Projects = lazy(() => import('./pages/Projects'))
const Generator = lazy(() => import('./pages/Generator'))
const Wbs = lazy(() => import('./pages/Wbs'))
const Board = lazy(() => import('./pages/Board'))
const Gantt = lazy(() => import('./pages/Gantt'))
const Risks = lazy(() => import('./pages/Risks'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))

const PAGES: Record<Route, ComponentType> = {
  dashboard: Dashboard,
  projects: Projects,
  generator: Generator,
  wbs: Wbs,
  board: Board,
  gantt: Gantt,
  risks: Risks,
  reports: Reports,
  settings: Settings,
}

export default function App() {
  const ready = useApp((s) => s.ready)
  const projectId = useApp((s) => s.currentProjectId)
  const route = useRoute()
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    void useApp.getState().init()
  }, [])
  useEffect(() => setNavOpen(false), [route])

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-ink-500" role="status">
        Loading workspace…
      </div>
    )
  }

  const Page = PAGES[route]
  return (
    <div className="flex h-dvh overflow-hidden print:block print:h-auto print:overflow-visible">
      <Sidebar route={route} open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
            <Suspense fallback={<p className="py-16 text-center text-sm text-ink-400">Loading…</p>}>
              {/* Remount project-scoped pages when the project changes so no stale local state leaks across. */}
              <Page key={route === 'generator' || route === 'settings' ? route : `${route}:${projectId}`} />
            </Suspense>
          </div>
        </main>
      </div>
      <TaskDrawer />
      <Assistant />
      <Toasts />
    </div>
  )
}
