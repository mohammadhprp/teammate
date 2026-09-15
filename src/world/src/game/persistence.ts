import { MODULE_SLOTS, type AgentRole } from '../world/layout'
import type { AgentRecord, Project } from './state'

/**
 * Persistence.
 *
 * The whole simulation is plain data, so the save is just a snapshot of the
 * project table, the agent records and the module registry. It lives behind a
 * versioned key; a missing, stale or corrupted payload always falls back to a
 * fresh ship rather than throwing.
 */

export const SAVE_KEY = 'team-mate-world.save.v1'
export const SAVE_VERSION = 1

export interface SaveData {
  v: number
  savedAt: number
  projects: Project[]
  completed: Project[]
  records: AgentRecord[]
  moduleCounter: number
  /** moduleId -> projectId */
  moduleOwner: [string, string][]
  /** module ids released by a finished project, ready to reuse */
  moduleReleased: string[]
}

const SLOTS = new Set(MODULE_SLOTS)
const ROLES = new Set<AgentRole>(['backend', 'frontend', 'review', 'test'])

function validProject(p: unknown): p is Project {
  if (!p || typeof p !== 'object') return false
  const q = p as Record<string, unknown>
  const tasks = q.tasks as unknown
  return (
    typeof q.id === 'string' &&
    typeof q.name === 'string' &&
    typeof q.moduleId === 'string' &&
    SLOTS.has(q.moduleId) &&
    Array.isArray(tasks) &&
    tasks.every((t) => !!t && typeof t === 'object' && typeof (t as { id?: unknown }).id === 'string') &&
    Array.isArray(q.agents)
  )
}

function validRecord(r: unknown): r is AgentRecord {
  if (!r || typeof r !== 'object') return false
  const q = r as Record<string, unknown>
  return (
    typeof q.id === 'string' &&
    typeof q.name === 'string' &&
    typeof q.projectId === 'string' &&
    typeof q.role === 'string' &&
    ROLES.has(q.role as AgentRole)
  )
}

export function save(data: SaveData): void {
  try {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...data, v: SAVE_VERSION, savedAt: Date.now() }),
    )
  } catch {
    // storage unavailable (private mode, disabled): run without persistence
  }
}

export function load(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as SaveData
    if (!data || data.v !== SAVE_VERSION) return null
    if (!Array.isArray(data.projects) || !Array.isArray(data.completed)) return null
    if (!Array.isArray(data.records) || !Array.isArray(data.moduleOwner)) return null
    if (!data.projects.every(validProject) || !data.completed.every(validProject)) return null
    if (!data.records.every(validRecord)) return null
    if (!Array.isArray(data.moduleReleased)) return null
    return data
  } catch {
    return null
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // nothing to do
  }
}
