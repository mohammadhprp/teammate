import { C } from '../core/palette'
import { MODULE_SLOTS, type AgentRole } from '../world/layout'

/** The project system. Nothing here knows about 3D — the simulation turns
 *  every field into something physical inside the ship. */

export type ProjectStatus = 'active' | 'completed'
export type TaskStatus = 'pending' | 'active' | 'done'
/** Lifecycle of the physical module a project sits in. */
export type ModuleState = 'claimed' | 'completed' | 'released'

export interface Task {
  id: string
  title: string
  role: AgentRole
  seconds: number
  status: TaskStatus
  agentId?: string
}

export interface Project {
  id: string
  name: string
  subtitle: string
  accent: number
  status: ProjectStatus
  /** Which physical module on the project deck this project occupies. */
  moduleId: string
  /** claimed -> completed -> released, as the module is reused or regrown. */
  moduleState: ModuleState
  /** The ordinal shown on the module's doorway sign ("PROJECT 04"). */
  moduleNumber: number
  tasks: Task[]
  agents: string[]
  createdAt: number
}

/**
 * Owns the map from physical module slots to live projects. A finished module
 * is released and reused before the deck grows into the second band, so a slot
 * never carries two live projects at once.
 */
export class ModuleRegistry {
  private owner = new Map<string, string>()
  private released: string[] = []

  /** The live project sitting in a module, if any. */
  live(moduleId: string) {
    return this.owner.get(moduleId)
  }

  /** A released slot first, then the next unclaimed slot on either deck. */
  next(): string | null {
    while (this.released.length) {
      const m = this.released.shift()!
      if (!this.owner.has(m)) return m
    }
    return MODULE_SLOTS.find((m) => !this.owner.has(m)) ?? null
  }

  claim(moduleId: string, projectId: string) {
    this.owner.set(moduleId, projectId)
    this.released = this.released.filter((m) => m !== moduleId)
  }

  complete(moduleId: string, projectId: string) {
    if (this.owner.get(moduleId) !== projectId) return
    this.owner.delete(moduleId)
    if (!this.released.includes(moduleId)) this.released.push(moduleId)
  }

  snapshot(): { owner: [string, string][]; released: string[] } {
    return { owner: [...this.owner.entries()], released: [...this.released] }
  }

  restore(owner: [string, string][], released: string[]) {
    this.owner = new Map(owner)
    this.released = [...released]
  }
}

export interface AgentRecord {
  id: string
  name: string
  role: AgentRole
  projectId: string
  status: 'created' | 'traveling' | 'working' | 'reviewing' | 'returning' | 'idle' | 'done'
  taskId?: string
  anchorId?: string
}

export const projectProgress = (p: Project) => {
  if (!p.tasks.length) return 0
  return p.tasks.filter((t) => t.status === 'done').length / p.tasks.length
}

export const ROLE_COLOR: Record<AgentRole, number> = {
  backend: C.green,
  frontend: C.blue,
  review: C.gold,
  test: C.red,
}

export const ROLE_LABEL: Record<AgentRole, string> = {
  backend: 'BACKEND',
  frontend: 'FRONTEND',
  review: 'REVIEW',
  test: 'TEST',
}

let seq = 0
export const nextId = (prefix: string) => `${prefix}-${(++seq).toString(36)}`

/** Keep generated ids ahead of a restored save so ids never collide. */
export function reserveId(id: string) {
  const m = /-([0-9a-z]+)$/.exec(id)
  if (!m) return
  const v = parseInt(m[1], 36)
  if (Number.isFinite(v) && v > seq) seq = v
}

const SUFFIX = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']
const usedNames = new Set<string>()

/** Claim a name already used by a restored robot so it is never handed out again. */
export function reserveAgentName(name: string) {
  usedNames.add(name)
}

/** Team Mate names every worker by job plus a sequence suffix. */
export function makeAgentName(role: AgentRole) {
  let i = 0
  while (i < 40) {
    const name = `${role}-${SUFFIX[i % SUFFIX.length]}${i >= SUFFIX.length ? Math.floor(i / SUFFIX.length) : ''}`
    if (!usedNames.has(name)) {
      usedNames.add(name)
      return name
    }
    i++
  }
  return `${role}-omega`
}
