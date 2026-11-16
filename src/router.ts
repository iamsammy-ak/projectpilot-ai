import { useSyncExternalStore } from 'react'

/** Hash-based routing: works from any static host and survives a page refresh. */
export const ROUTES = ['dashboard', 'projects', 'generator', 'wbs', 'board', 'gantt', 'risks', 'reports', 'settings'] as const
export type Route = (typeof ROUTES)[number]

const read = (): Route => {
  const r = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return (ROUTES as readonly string[]).includes(r) ? (r as Route) : 'dashboard'
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export const useRoute = (): Route => useSyncExternalStore(subscribe, read)

export function navigate(route: Route | string) {
  window.location.hash = `/${route}`
  document.querySelector('main')?.scrollTo({ top: 0 })
}
