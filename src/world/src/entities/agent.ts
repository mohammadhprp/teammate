import * as THREE from 'three'
import { C } from '../core/palette'
import { buildRobot, buildTeamMate, type RobotModel } from './robot'
import type { RoleIcon } from '../core/textures'
import type { AgentRole } from '../world/layout'
import type { NavGraph, NavNode } from '../world/nav'
import { angleDelta, clamp, damp } from '../core/math'

/**
 * A robot that lives in the ship.
 *
 * Team Mate and every worker agent share this class: the same locomotion, the
 * same path following over the ship's nav mesh, the same state language. The
 * only difference is the model it wears and the script it is given.
 */

export type AgentState =
  | 'docked'
  | 'moving'
  | 'working'
  | 'reporting'
  | 'returning'
  | 'complete'
  | 'blocked'

const ACCENT_BY_ROLE: Record<AgentRole, number> = {
  backend: C.green,
  frontend: C.blue,
  review: C.gold,
  test: C.red,
}

const ICON_BY_ROLE: Record<AgentRole, RoleIcon> = {
  backend: 'gear',
  frontend: 'code',
  review: 'check',
  test: 'flask',
}

export interface AgentOptions {
  id: string
  name: string
  nav: NavGraph
  role?: AgentRole
  accent?: number
  speed?: number
}

export class Agent {
  readonly id: string
  readonly name: string
  readonly role?: AgentRole
  readonly accent: number
  readonly root: THREE.Group
  readonly model: RobotModel

  state: AgentState = 'docked'
  x: number
  z: number
  facing = 0
  speed: number
  /** Optional per-agent multiplier, used for the simulation time scale. */
  timeScale = 1

  private nav: NavGraph
  private path: NavNode[] = []
  private pathIndex = 0
  private then: (() => void) | null = null
  private wheelSpin = 0
  private bob = 0
  private working = 0
  private ringPhase = Math.random() * 6
  private reportTimer = 0
  /** Wall-clock duration of the current work step, in seconds. */
  workTime = 0
  workElapsed = 0

  constructor(opts: AgentOptions) {
    this.id = opts.id
    this.name = opts.name
    this.nav = opts.nav
    this.role = opts.role
    this.accent = opts.accent ?? (opts.role ? ACCENT_BY_ROLE[opts.role] : C.cyan)
    this.speed = opts.speed ?? 4.4
    this.model = opts.role
      ? buildRobot(this.accent, ICON_BY_ROLE[opts.role])
      : buildTeamMate(this.accent)
    this.root = new THREE.Group()
    this.root.name = `agent:${opts.id}`
    this.root.add(this.model.root)
    this.x = 0
    this.z = 0
  }

  place(x: number, z: number, facing = 0) {
    this.x = x
    this.z = z
    this.facing = facing
    this.root.position.set(x, 0.42, z)
    this.root.rotation.y = facing
    this.path = []
    this.pathIndex = 0
  }

  get isBusy() {
    return this.state === 'moving' || this.state === 'working' || this.state === 'reporting'
  }

  /** Walk the nav mesh to a world position. */
  goToPoint(x: number, z: number, onArrive?: () => void) {
    this.path = this.nav.path(this.x, this.z, x, z)
    this.pathIndex = 0
    this.then = onArrive ?? null
    this.state = 'moving'
  }

  /** Walk to a registered anchor. */
  goToAnchor(anchorId: string, onArrive?: () => void) {
    const a = this.nav.anchor(anchorId)
    if (!a) {
      onArrive?.()
      return
    }
    this.path = this.nav.path(this.x, this.z, a.x, a.z)
    this.pathIndex = 0
    this.then = onArrive ?? null
    this.state = 'moving'
  }

  /** Face a world direction immediately (used when parking at a station). */
  faceTowards(x: number, z: number) {
    this.facing = Math.atan2(x - this.x, z - this.z)
    this.root.rotation.y = this.facing
  }

  setFacing(f: number) {
    this.facing = f
    this.root.rotation.y = f
  }

  /** Face the anchor's stored direction, snapped. */
  alignToAnchor(anchorId: string) {
    const a = this.nav.anchor(anchorId)
    if (!a) return
    this.setFacing(Math.atan2(a.fx, a.fz))
  }

  startWorking(seconds: number, onDone?: () => void) {
    this.state = 'working'
    this.workTime = seconds
    this.workElapsed = 0
    this.working = 0
    this.then = onDone ?? null
  }

  workProgress() {
    return this.workTime <= 0 ? 1 : clamp(this.workElapsed / this.workTime, 0, 1)
  }

  /** Short "report" beat: the robot faces the speaker and flashes its light. */
  startReporting(seconds: number, onDone?: () => void) {
    this.state = 'reporting'
    this.reportTimer = seconds
    this.workTime = seconds
    this.workElapsed = 0
    this.then = onDone ?? null
  }

  stop() {
    this.path = []
    this.then = null
    this.state = 'docked'
  }

  private finish(kind: 'move' | 'work') {
    const cb = this.then
    this.then = null
    if (kind === 'move') this.path = []
    this.state = 'docked'
    cb?.()
  }

  update(dt: number) {
    const step = dt * this.timeScale
    this.bob += step
    this.ringPhase += step * 2

    if (this.state === 'moving') this.followPath(step)
    else if (this.state === 'working') {
      this.workElapsed += step
      this.working = Math.min(1, this.working + step * 2)
      if (this.workElapsed >= this.workTime) {
        this.working = 0
        this.finish('work')
      }
    } else if (this.state === 'reporting') {
      this.workElapsed += step
      if (this.workElapsed >= this.reportTimer) this.finish('work')
    }

    this.animate(step)
  }

  private followPath(dt: number) {
    if (!this.path.length || this.pathIndex >= this.path.length) {
      this.finish('move')
      return
    }
    const target = this.path[this.pathIndex]
    const dx = target.x - this.x
    const dz = target.z - this.z
    const dist = Math.hypot(dx, dz)
    const arriveRadius = this.pathIndex >= this.path.length - 1 ? 0.5 : 1.1
    if (dist < arriveRadius) {
      this.pathIndex++
      if (this.pathIndex >= this.path.length) {
        this.x = target.x
        this.z = target.z
        this.finish('move')
        return
      }
      return
    }
    const dirX = dx / dist
    const dirZ = dz / dist
    const speed = this.speed * Math.min(1, dist / 1.6)
    const move = speed * dt
    this.x += dirX * move
    this.z += dirZ * move
    const want = Math.atan2(dirX, dirZ)
    this.facing += angleDelta(this.facing, want) * Math.min(1, dt * 7)
    this.wheelSpin += move * 2.6
  }

  private animate(dt: number) {
    this.root.position.set(this.x, 0.42, this.z)
    this.root.rotation.y = this.facing

    const m = this.model
    // tracks
    for (const w of m.leftWheels) w.rotation.x = this.wheelSpin
    for (const w of m.rightWheels) w.rotation.x = this.wheelSpin

    // idle hover bob, quicker while working
    const bobAmount = this.state === 'working' ? 0.045 : this.state === 'moving' ? 0.02 : 0.012
    m.root.position.y = Math.sin(this.bob * (this.state === 'working' ? 6 : 2.2)) * bobAmount

    // head looks around when idle, locks on when working
    const scan = this.state === 'docked' ? 0.5 : 0.12
    m.head.rotation.y = Math.sin(this.bob * 0.8 + this.ringPhase) * scan
    m.head.rotation.x =
      damp(m.head.rotation.x, this.state === 'working' ? -0.22 + Math.sin(this.bob * 5) * 0.08 : 0, 6, dt)
    m.neck.position.y = 1.24 - this.working * 0.06

    // status ring: pulses, brighter the busier the robot is
    const activity =
      this.state === 'working' ? 1 : this.state === 'moving' ? 0.7 : this.state === 'reporting' ? 1.2 : 0.4
    const pulse = 0.45 + 0.35 * Math.sin(this.ringPhase * (this.state === 'working' ? 4 : 1.6))
    m.ringMat.opacity = 0.18 + pulse * activity * 0.5
    m.ringMat.color.setHex(this.accent)
    m.lensMat.emissiveIntensity = 0.28 + activity * 0.5
    m.headLight.intensity = 0.5 + activity * 0.9
  }

  setAccent(color: number) {
    this.model.ringMat.color.setHex(color)
  }
}

export { ACCENT_BY_ROLE, ICON_BY_ROLE }
