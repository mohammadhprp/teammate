import * as THREE from 'three'
import { Agent } from '../entities/agent'
import type { Ship } from '../world/ship'
import { ACCENT, M } from '../core/palette'
import { bus } from '../core/events'
import { plaqueTexture } from '../core/textures'
import { plane } from '../world/props'
import { MODULE_SLOTS, ROLE_ROOM, type AgentRole } from '../world/layout'
import { makeAgentName, nextId, projectProgress, type AgentRecord, type Project, type Task } from './state'
import type { MissionTemplate } from './missions'

/**
 * THE SIMULATION — where game state becomes world state.
 *
 * Every step of the loop is a physical event inside the ship:
 *
 *   project created  -> a module lights up and its sign is rewritten
 *   agent created    -> a robot materialises on a launch pad in the robot dock
 *   agent assigned   -> the robot drives to its lab, then to its workstation
 *   agent working    -> the robot faces the terminal and works
 *   error            -> a red beacon starts turning over the module door
 *   task complete    -> the module's holo board fills another bar
 *   project complete -> a plaque appears in the mission archive
 *   Team Mate        -> drives to its HQ dais to orchestrate, comes back to report
 */

interface Tween {
  t: number
  d: number
  finished?: boolean
  update: (k: number) => void
  done?: () => void
}

export interface SimulationHooks {
  onReport(text: string, kind: 'info' | 'success' | 'warn'): void
}

export class Simulation {
  private ship: Ship
  private scene: THREE.Scene
  private hooks: SimulationHooks

  agents = new Map<string, Agent>()
  records = new Map<string, AgentRecord>()
  projects = new Map<string, Project>()
  completed: Project[] = []

  timeScale = 1
  paused = false

  private tm: Agent
  private tmMode: 'idle' | 'to-hq' | 'orchestrating' | 'to-deck' | 'reporting' = 'idle'
  private tweens: Tween[] = []
  private spawns: { rec: AgentRecord; timer: number }[] = []
  private alerts = new Map<string, THREE.Mesh>()
  private plaques: THREE.Group[] = []
  private moduleOf = new Map<string, string>()
  private plaqueCount = 0
  private hqBoards: THREE.Object3D[] = []
  private moduleCounter = 0

  constructor(ship: Ship, scene: THREE.Scene, hooks: SimulationHooks) {
    this.ship = ship
    this.scene = scene
    this.hooks = hooks

    this.tm = new Agent({
      id: 'team-mate',
      name: 'team-mate',
      nav: ship.nav,
      accent: 0x5fd8f0,
      speed: 3.6,
    })
    scene.add(this.tm.root)
    const home = ship.nav.anchor('tm:command')
    if (home) this.tm.place(home.x, home.z, Math.atan2(home.fx, home.fz))

    for (let i = 0; i < 5; i++) {
      const b = ship.ctx.get(`holo:hq:${i}`)
      if (b) {
        b.userData.setTitle?.('STANDBY', '')
        b.userData.setProgress?.(0)
        this.hqBoards.push(b)
      }
    }
    const cmd = ship.ctx.get('holo:command')
    cmd?.userData.setTitle?.('NO ACTIVE MISSION', '')
    cmd?.userData.setProgress?.(0)
  }

  // -------------------------------------------------------------------------
  // Developer actions
  // -------------------------------------------------------------------------

  /** The developer has given Team Mate a mission. */
  createProject(mission: MissionTemplate): Project | null {
    const moduleId = MODULE_SLOTS.find((m) => !this.moduleOf.has(m))
    if (!moduleId) {
      this.hooks.onReport('All project modules are occupied.', 'warn')
      return null
    }
    const accent = ACCENT[mission.accent]
    this.moduleCounter++
    const project: Project = {
      id: nextId('proj'),
      name: mission.name,
      subtitle: mission.subtitle,
      accent,
      status: 'active',
      moduleId,
      tasks: mission.tasks.map((t) => ({
        id: nextId('task'),
        title: t.title,
        role: t.role,
        seconds: t.seconds,
        status: 'pending' as const,
      })),
      agents: [],
      createdAt: performance.now(),
    }
    this.projects.set(project.id, project)
    this.moduleOf.set(moduleId, project.id)

    // --- world: the module wakes up ---------------------------------------
    this.ship.setRoomPower(moduleId, true)
    this.ship.setSign(moduleId, `PROJECT ${this.moduleCounter.toString().padStart(2, '0')}`, project.name, accent)
    this.spawnAlert(moduleId)
    const board = this.ship.ctx.get(`holo:${moduleId}`)
    board?.userData.setTitle?.(project.name, project.subtitle)
    board?.userData.setProgress?.(0.04, accent)

    bus.emit({ type: 'project:created', projectId: project.id, moduleId })

    // --- world: robots are built for the job ------------------------------
    const roles = [...new Set(project.tasks.map((t) => t.role))]
    roles.forEach((role, i) => this.spawnAgent(role, project, i * 0.9))
    this.updateBoards()

    // --- world: Team Mate takes up position --------------------------------
    this.sendTeamMateToHQ()

    this.hooks.onReport(
      `Mission accepted — “${project.name}”. ${roles.length} agent${
        roles.length === 1 ? '' : 's'
      } assigned to module ${MODULE_SLOTS.indexOf(moduleId) + 1}.`,
      'info',
    )
    return project
  }

  // -------------------------------------------------------------------------
  // Agents
  // -------------------------------------------------------------------------

  private spawnAgent(role: AgentRole, project: Project, delay: number) {
    const id = nextId('agent')
    const name = makeAgentName(role)
    const agent = new Agent({ id, name, nav: this.ship.nav, role, speed: 4.2 + Math.random() * 0.8 })
    const bay = this.ship.nav.freeAnchor('dock', 'dock', id)
    if (bay) bay.busy = id
    agent.place(bay?.x ?? 0, bay?.z ?? 150, Math.PI)
    agent.timeScale = this.timeScale
    agent.root.scale.setScalar(0.02)
    this.scene.add(agent.root)
    this.agents.set(id, agent)

    const rec: AgentRecord = {
      id,
      name,
      role,
      projectId: project.id,
      status: 'created',
      anchorId: bay?.id,
    }
    this.records.set(id, rec)
    project.agents.push(id)

    this.spawns.push({ rec, timer: delay })
    this.tweens.push({ t: 0, d: 0.7, update: (k) => agent.root.scale.setScalar(0.02 + k * 0.98) })
    bus.emit({ type: 'agent:created', agentId: id, role })
    this.hooks.onReport(`${name} is being assembled on launch pad ${bay?.id ?? '1'}.`, 'info')
  }

  private releaseAnchor(rec: AgentRecord) {
    if (!rec.anchorId) return
    const a = this.ship.nav.anchor(rec.anchorId)
    if (a && a.busy === rec.id) a.busy = null
    rec.anchorId = undefined
  }

  private claim(rec: AgentRecord, anchorId: string | undefined) {
    rec.anchorId = anchorId
    if (!anchorId) return
    const a = this.ship.nav.anchor(anchorId)
    if (a) a.busy = rec.id
  }

  /** Robot leaves the dock and drives to its home berth in its own lab. */
  private launchAgent(rec: AgentRecord) {
    const agent = this.agents.get(rec.id)
    if (!agent) return
    this.releaseAnchor(rec)
    const room = ROLE_ROOM[rec.role]
    const home =
      this.ship.nav.freeAnchor('home', room, rec.id) ?? this.ship.nav.freeAnchor('home', undefined, rec.id)
    this.claim(rec, home?.id)
    rec.status = 'traveling'
    agent.goToAnchor(home?.id ?? 'dock:pad', () => {
      agent.alignToAnchor(home?.id ?? 'dock:pad')
      rec.status = 'idle'
      this.assignNextTask(rec)
    })
    this.hooks.onReport(`${rec.name} left the dock and is heading for the ${room} lab.`, 'info')
  }

  /** Pick the next task this robot's role can do, then walk to the station. */
  private assignNextTask(rec: AgentRecord) {
    const project = this.projects.get(rec.projectId)
    const agent = this.agents.get(rec.id)
    if (!project || !agent) return
    if (project.status === 'completed') {
      this.sendHome(rec, false)
      return
    }
    const task = project.tasks.find((t) => t.status === 'pending' && t.role === rec.role)
    if (!task) {
      this.sendHome(rec, true)
      return
    }
    task.status = 'active'
    task.agentId = rec.id
    rec.taskId = task.id
    rec.status = 'traveling'
    this.releaseAnchor(rec)

    const anchor = this.stationFor(task, project, rec.id)
    this.claim(rec, anchor?.id)
    bus.emit({ type: 'agent:assigned', agentId: rec.id, projectId: project.id })

    agent.goToAnchor(anchor?.id ?? `${project.moduleId}:center`, () => {
      if (anchor) agent.alignToAnchor(anchor.id)
      this.beginWork(rec, project, task)
    })
    if (task.role === 'review') bus.emit({ type: 'agent:review', agentId: rec.id, projectId: project.id })
  }

  private stationFor(task: Task, project: Project, agentId: string) {
    if (task.role === 'review') {
      return (
        this.ship.nav.freeAnchor('station', 'review', agentId) ??
        this.ship.nav.freeAnchor('station', undefined, agentId)
      )
    }
    if (task.role === 'test') {
      return (
        this.ship.nav.freeAnchor('station', 'test', agentId) ??
        this.ship.nav.freeAnchor('station', undefined, agentId)
      )
    }
    return (
      this.ship.nav.freeAnchor('workstation', project.moduleId, agentId) ??
      this.ship.nav.freeAnchor('workstation', undefined, agentId)
    )
  }

  private beginWork(rec: AgentRecord, project: Project, task: Task) {
    const agent = this.agents.get(rec.id)
    if (!agent) return
    rec.status = task.role === 'review' ? 'reviewing' : 'working'
    bus.emit({ type: 'agent:working', agentId: rec.id, projectId: project.id })
    agent.startWorking(task.seconds, () => this.onTaskDone(rec))
  }

  /** A task finished: update the module, maybe raise a finding, move on. */
  private onTaskDone(rec: AgentRecord) {
    const project = this.projects.get(rec.projectId)
    const agent = this.agents.get(rec.id)
    if (!project || !agent) return
    const task = project.tasks.find((t) => t.id === rec.taskId)
    if (!task) return
    task.status = 'done'
    task.agentId = undefined
    rec.taskId = undefined
    this.releaseAnchor(rec)

    const progress = projectProgress(project)
    bus.emit({ type: 'task:completed', projectId: project.id, taskId: task.id })
    bus.emit({ type: 'project:progress', projectId: project.id, progress })
    this.updateBoards()
    this.hooks.onReport(
      `${rec.name} finished “${task.title}” — ${Math.round(progress * 100)}% complete.`,
      'info',
    )

    // A review can send work back: the module raises a red beacon.
    if (task.role === 'review' && !project.tasks.some((t) => t.title.startsWith('Fix:'))) {
      const owner = project.tasks.find((t) => t.role === 'backend' || t.role === 'frontend')
      if (owner) {
        project.tasks.push({
          id: nextId('task'),
          title: `Fix: ${owner.title.slice(0, 30)}`,
          role: owner.role,
          seconds: 8,
          status: 'pending',
        })
        this.setAlert(project.moduleId, true)
        bus.emit({ type: 'agent:error', agentId: rec.id, projectId: project.id })
        bus.emit({ type: 'ship:warning', on: true })
        this.hooks.onReport(
          `${rec.name} found an issue — rework requested in module ${
            MODULE_SLOTS.indexOf(project.moduleId) + 1
          }.`,
          'warn',
        )
      }
    } else if (task.title.startsWith('Fix:')) {
      this.setAlert(project.moduleId, false)
      bus.emit({ type: 'ship:warning', on: false })
      this.hooks.onReport(`${rec.name} landed the fix. Beacon cleared.`, 'success')
    }

    if (projectProgress(project) >= 1) {
      this.completeProject(project)
      return
    }

    const more = project.tasks.find((t) => t.status === 'pending' && t.role === rec.role)
    if (more) {
      // short reset at the bench, then take the next item
      rec.status = 'working'
      agent.startWorking(0.7, () => this.assignNextTask(rec))
    } else {
      this.sendHome(rec, true)
    }
  }

  /** Robot reports at the module, then parks in its lab. */
  private sendHome(rec: AgentRecord, report: boolean) {
    const agent = this.agents.get(rec.id)
    const project = this.projects.get(rec.projectId)
    if (!agent || !project) return
    rec.status = 'returning'

    const goLab = () => {
      const home =
        this.ship.nav.freeAnchor('home', ROLE_ROOM[rec.role], rec.id) ??
        this.ship.nav.freeAnchor('home', undefined, rec.id)
      this.releaseAnchor(rec)
      this.claim(rec, home?.id)
      agent.goToAnchor(home?.id ?? 'dock:pad', () => {
        agent.alignToAnchor(home?.id ?? 'dock:pad')
        rec.status = 'idle'
        bus.emit({ type: 'agent:returning', agentId: rec.id })
      })
      this.hooks.onReport(`${rec.name} is standing by in the ${ROLE_ROOM[rec.role]} lab.`, 'info')
    }

    if (report) {
      const park = this.ship.nav.freeAnchor('park', project.moduleId, rec.id)
      this.releaseAnchor(rec)
      this.claim(rec, park?.id)
      agent.goToAnchor(park?.id ?? `${project.moduleId}:center`, () => {
        if (park) agent.alignToAnchor(park.id)
        const p = this.ship.nav.anchor(park?.id ?? '')
        if (p && p.busy === rec.id) p.busy = null
        rec.anchorId = undefined
        agent.startReporting(1.6, goLab)
      })
    } else {
      goLab()
    }
  }

  private completeProject(project: Project) {
    project.status = 'completed'
    this.moduleOf.delete(project.moduleId)
    this.completed.push(project)
    bus.emit({ type: 'project:completed', projectId: project.id })
    this.setAlert(project.moduleId, false)
    bus.emit({ type: 'ship:warning', on: false })

    this.ship.setRoomPower(project.moduleId, false)
    this.ship.setSign(project.moduleId, 'PROJECT', 'COMPLETED', project.accent)
    const board = this.ship.ctx.get(`holo:${project.moduleId}`)
    board?.userData.setTitle?.(project.name, 'COMPLETE')
    board?.userData.setProgress?.(1, project.accent)

    this.spawnPlaque(project)
    this.updateBoards()

    for (const agentId of project.agents) {
      const rec = this.records.get(agentId)
      if (!rec || rec.status === 'done') continue
      rec.status = 'done'
      const agent = this.agents.get(agentId)
      if (!agent) continue
      const home =
        this.ship.nav.freeAnchor('home', ROLE_ROOM[rec.role], rec.id) ??
        this.ship.nav.freeAnchor('home', undefined, rec.id)
      this.releaseAnchor(rec)
      this.claim(rec, home?.id)
      agent.goToAnchor(home?.id ?? 'dock:pad', () => {
        agent.alignToAnchor(home?.id ?? 'dock:pad')
        bus.emit({ type: 'agent:completed', agentId: rec.id })
      })
    }

    this.hooks.onReport(
      `Mission complete — “${project.name}”. A plaque has been placed in the archive.`,
      'success',
    )
    this.sendTeamMateToDeck()
  }

  private spawnPlaque(project: Project) {
    const slot = this.ship.nav.freeAnchor('plaque', 'archive', project.id)
    if (!slot) return
    slot.busy = project.id
    const group = new THREE.Group()
    group.position.set(slot.x, 2.2, slot.z)
    group.rotation.y = Math.atan2(slot.fx, slot.fz)
    const panel = new THREE.Mesh(
      plane(3.2, 1.34),
      new THREE.MeshBasicMaterial({ map: plaqueTexture(project.name, project.accent, true), transparent: true }),
    )
    const frame = new THREE.Mesh(plane(3.5, 1.62), M.holo(project.accent, 0.32))
    frame.position.z = -0.02
    const stand = new THREE.Mesh(plane(0.06, 1.0), M.holo(project.accent, 0.45))
    stand.position.set(0, -1.16, 0)
    group.add(frame, stand, panel)
    group.scale.setScalar(0.01)
    group.userData.phase = this.plaqueCount * 0.8
    this.scene.add(group)
    this.tweens.push({ t: 0, d: 1.1, update: (k) => group.scale.setScalar(0.01 + k * 0.99) })
    this.plaqueCount++
    this.plaques.push(group)
  }

  private spawnAlert(moduleId: string) {
    if (this.alerts.has(moduleId)) return
    const room = this.ship.rooms.get(moduleId)
    if (!room) return
    const def = room.def
    const side = def.doors[0].side === 'E' ? -1 : 1
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a1512,
      emissive: new THREE.Color(0xef5a45),
      emissiveIntensity: 2,
      roughness: 0.4,
    })
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), mat)
    beacon.position.set(side * 3.9, 7.1, def.center[1])
    beacon.visible = false
    this.scene.add(beacon)
    this.alerts.set(moduleId, beacon)
  }

  private setAlert(moduleId: string, on: boolean) {
    const m = this.alerts.get(moduleId)
    if (m) m.visible = on
  }

  private updateBoards() {
    const active = [...this.projects.values()].filter((p) => p.status === 'active')
    this.hqBoards.forEach((b, i) => {
      const p = active[i]
      if (p) {
        b.userData.setTitle?.(p.name, `${Math.round(projectProgress(p) * 100)}%`)
        b.userData.setProgress?.(projectProgress(p), p.accent)
      } else {
        b.userData.setTitle?.('STANDBY', '')
        b.userData.setProgress?.(0)
      }
    })
    const latest = active[0] ?? this.completed[this.completed.length - 1]
    const cmd = this.ship.ctx.get('holo:command')
    if (latest) {
      const prog = projectProgress(latest)
      cmd?.userData.setTitle?.(latest.name, `${Math.round(prog * 100)}% COMPLETE`)
      cmd?.userData.setProgress?.(latest.status === 'completed' ? 1 : prog, latest.accent)
    } else {
      cmd?.userData.setTitle?.('NO ACTIVE MISSION', '')
      cmd?.userData.setProgress?.(0)
    }
  }

  private sendTeamMateToHQ() {
    if (this.tmMode === 'to-hq' || this.tmMode === 'orchestrating') return
    this.tmMode = 'to-hq'
    this.tm.goToAnchor('tm:hq', () => {
      this.tmMode = 'orchestrating'
      this.tm.alignToAnchor('tm:hq')
    })
  }

  private sendTeamMateToDeck() {
    if (this.tmMode === 'to-deck') return
    this.tmMode = 'to-deck'
    this.tm.goToAnchor('tm:command', () => {
      this.tm.alignToAnchor('tm:command')
      this.tmMode = 'reporting'
      this.tm.startReporting(2.4, () => {
        this.tmMode = 'idle'
        this.hooks.onReport('Team Mate: all missions accounted for, commander.', 'success')
      })
    })
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  update(dt: number) {
    if (this.paused) return
    const scaled = dt * this.timeScale

    for (const t of this.tweens) {
      t.t += dt
      const k = Math.min(1, t.t / t.d)
      t.update(k)
      if (k >= 1 && !t.finished) {
        t.finished = true
        t.done?.()
      }
    }
    if (this.tweens.some((t) => t.finished)) this.tweens = this.tweens.filter((t) => !t.finished)

    for (let i = this.spawns.length - 1; i >= 0; i--) {
      const s = this.spawns[i]
      s.timer -= scaled
      if (s.timer <= 0) {
        this.spawns.splice(i, 1)
        this.launchAgent(s.rec)
      }
    }

    for (const agent of this.agents.values()) {
      agent.timeScale = this.timeScale
      agent.update(dt)
    }
    this.tm.timeScale = this.timeScale
    this.tm.update(dt)

    if (this.tmMode === 'orchestrating') {
      const stillActive = [...this.projects.values()].some((p) => p.status === 'active')
      if (!stillActive) this.sendTeamMateToDeck()
    }

    const t = performance.now() / 1000
    for (const p of this.plaques) {
      p.position.y = 2.2 + Math.sin(t * 1.1 + p.userData.phase) * 0.06
    }
    for (const m of this.alerts.values()) {
      if (!m.visible) continue
      ;(m.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.6 + Math.abs(Math.sin(t * 3.4)) * 2.2
    }
  }

  /** Head count per role: used for a compact status line. */
  roster() {
    const out: Record<string, number> = {}
    for (const r of this.records.values()) out[r.role] = (out[r.role] ?? 0) + 1
    return out
  }

  teamMatePosition() {
    return { x: this.tm.x, z: this.tm.z }
  }
}
