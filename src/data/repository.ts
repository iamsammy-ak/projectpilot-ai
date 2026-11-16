import type { Workspace } from '../types'
import { DEFAULT_SETTINGS, WORKSPACE_VERSION } from './seed'

/**
 * Persistence boundary. The app only ever talks to this interface, so swapping localStorage for a
 * REST API or database means writing one new class — nothing in the store or the views changes.
 * Methods are async for that reason, even though localStorage itself is synchronous.
 */
export interface WorkspaceRepository {
  load(): Promise<Workspace | null>
  save(workspace: Workspace): Promise<void>
  clear(): Promise<void>
}

const KEY = 'projectpilot.workspace.v1'

export class LocalStorageRepository implements WorkspaceRepository {
  async load(): Promise<Workspace | null> {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return null
      return normalize(JSON.parse(raw))
    } catch {
      return null
    }
  }

  async save(workspace: Workspace): Promise<void> {
    localStorage.setItem(KEY, JSON.stringify(workspace))
  }

  async clear(): Promise<void> {
    localStorage.removeItem(KEY)
  }
}

/** Validate the shape of stored or imported data and fill in anything a newer version added. */
export function normalize(data: unknown): Workspace | null {
  if (!data || typeof data !== 'object') return null
  const ws = data as Partial<Workspace>
  if (!Array.isArray(ws.projects)) return null
  const projects = ws.projects.filter((p) => p && typeof p.id === 'string' && Array.isArray(p.tasks))
  return {
    version: WORKSPACE_VERSION,
    projects: projects.map((p) => ({
      ...p,
      planNotes: p.planNotes ?? [],
      risks: p.risks ?? [],
      resources: p.resources ?? [],
      activity: p.activity ?? [],
      spent: p.spent ?? 0,
    })),
    currentProjectId: projects.some((p) => p.id === ws.currentProjectId) ? ws.currentProjectId! : (projects[0]?.id ?? null),
    settings: { ...DEFAULT_SETTINGS, ...(ws.settings ?? {}) },
  }
}

export const repository: WorkspaceRepository = new LocalStorageRepository()
