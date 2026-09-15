import { C } from '../core/palette'
import type { AgentRole } from '../world/layout'

/** The project system. Nothing here knows about 3D — the simulation turns
 *  every field into something physical inside the ship. */

export type ProjectStatus = 'active' | 'completed'
export type TaskStatus = 'pending' | 'active' | 'done'

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
  tasks: Task[]
  agents: string[]
  createdAt: number
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

const SUFFIX = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']
const usedNames = new Set<string>()

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
