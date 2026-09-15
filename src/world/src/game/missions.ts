import type { AccentName } from '../core/palette'
import type { AgentRole } from '../world/layout'

/**
 * The missions the developer can hand to Team Mate from the command console.
 * Each one is a small engineering plan: a few tasks, each owned by a role, each
 * taking a physical amount of time at a physical workstation.
 */

export interface MissionTask {
  title: string
  role: AgentRole
  seconds: number
}

export interface MissionTemplate {
  id: string
  name: string
  subtitle: string
  accent: AccentName
  summary: string
  tasks: MissionTask[]
}

export const MISSIONS: MissionTemplate[] = [
  {
    id: 'ecommerce',
    name: 'E-COMMERCE',
    subtitle: 'CHECKOUT & ORDERS',
    accent: 'cyan',
    summary: 'Storefront, cart, payments and order pipeline.',
    tasks: [
      { title: 'Model the order and cart schema', role: 'backend', seconds: 9 },
      { title: 'Expose the checkout API', role: 'backend', seconds: 11 },
      { title: 'Build the product grid and cart UI', role: 'frontend', seconds: 10 },
      { title: 'Audit the payment edge cases', role: 'review', seconds: 8 },
      { title: 'Run the checkout regression suite', role: 'test', seconds: 9 },
    ],
  },
  {
    id: 'mobile',
    name: 'MOBILE APP',
    subtitle: 'FIELD CLIENT',
    accent: 'blue',
    summary: 'Companion app: sync, offline queue, push notifications.',
    tasks: [
      { title: 'Sketch the navigation shell', role: 'frontend', seconds: 8 },
      { title: 'Wire the offline sync queue', role: 'backend', seconds: 12 },
      { title: 'Build the dashboard screens', role: 'frontend', seconds: 10 },
      { title: 'Verify the sync contract', role: 'review', seconds: 8 },
      { title: 'Simulate flaky network conditions', role: 'test', seconds: 10 },
    ],
  },
  {
    id: 'infrastructure',
    name: 'INFRASTRUCTURE',
    subtitle: 'PIPELINE & RUNTIME',
    accent: 'green',
    summary: 'Build pipeline, environments and observability.',
    tasks: [
      { title: 'Define the deployment topology', role: 'backend', seconds: 10 },
      { title: 'Automate the build pipeline', role: 'backend', seconds: 12 },
      { title: 'Instrument health and metrics', role: 'test', seconds: 9 },
      { title: 'Review the rollout plan', role: 'review', seconds: 9 },
    ],
  },
]

const ROLE_WORDS: [RegExp, AgentRole][] = [
  [/(ui|ux|interface|screen|frontend|front-end|react|css|design)/i, 'frontend'],
  [/(api|server|backend|back-end|database|schema|service|infra|deploy|pipeline)/i, 'backend'],
  [/(test|qa|verify|regression|simulat)/i, 'test'],
  [/(review|audit|inspect|check|quality)/i, 'review'],
]

/**
 * Turn a free-text instruction into a plan. Keyword based on purpose: the
 * physical loop is the point, and a real AI planner drops in behind this.
 */
export function planFromText(text: string): MissionTemplate {
  const clean = text.trim().replace(/\s+/g, ' ')
  const words = clean.split(' ')
  const name = (words.slice(0, 4).join(' ') || 'NEW MISSION').toUpperCase()
  const subtitle = (words.slice(4, 9).join(' ') || 'DEVELOPER REQUEST').toUpperCase()

  const roles = new Set<AgentRole>()
  for (const [re, role] of ROLE_WORDS) if (re.test(clean)) roles.add(role)
  if (!roles.size) {
    roles.add('backend')
    roles.add('frontend')
  }
  roles.add('review')

  const tasks: MissionTask[] = []
  const primary = [...roles]
  primary.forEach((role, i) => {
    tasks.push({ title: `${describe(role)} — pass ${i + 1}`, role, seconds: 8 + i * 2 })
  })
  if (!roles.has('test') && clean.length > 12) {
    tasks.push({ title: 'Regression pass on the change', role: 'test', seconds: 9 })
  }
  return {
    id: 'custom',
    name,
    subtitle,
    accent: 'cyan',
    summary: clean,
    tasks,
  }
}

function describe(role: AgentRole) {
  switch (role) {
    case 'backend':
      return 'Implement the service side'
    case 'frontend':
      return 'Build the interface'
    case 'review':
      return 'Review the change'
    case 'test':
      return 'Verify behaviour'
  }
}
