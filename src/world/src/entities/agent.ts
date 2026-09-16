import * as THREE from 'three'
import { C } from '../core/palette'
import { buildRobot, buildTeamMate, ROBOT_RIDE_HEIGHT, type RobotModel } from './robot'
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

/**
 * Silent state language: posture and light, no text.
 *
 *  docked (idle)  head lifted, scanning, upright
 *  working        head lowered, leaning into the station, lens bright
 *  reporting      head straight up, fast lens blink
 *  complete       parked, lens dimmed right down
 */
const POSTURE: Record<
  AgentState,
  {
    pitch: number
    scan: number
    neck: number
    lean: number
    roll: number
    lens: number
    pulse: number
    ring: number
    blink: number
    bob: number
    bobSpeed: number
  }
> = {
  docked: { pitch: -0.09, scan: 0.5, neck: 1.26, lean: 0, roll: 0, lens: 0.32, pulse: 1.6, ring: 0.4, blink: 0, bob: 0.012, bobSpeed: 2.2 },
  moving: { pitch: 0, scan: 0.16, neck: 1.24, lean: 0.05, roll: 0, lens: 0.5, pulse: 2.2, ring: 0.7, blink: 0, bob: 0.02, bobSpeed: 2.6 },
  working: { pitch: 0.26, scan: 0.05, neck: 1.15, lean: 0.22, roll: 0, lens: 1.0, pulse: 4.0, ring: 1.0, blink: 0, bob: 0.045, bobSpeed: 6 },
  reporting: { pitch: -0.24, scan: 0, neck: 1.3, lean: -0.05, roll: 0, lens: 1.5, pulse: 3.0, ring: 1.2, blink: 9, bob: 0.02, bobSpeed: 3 },
  returning: { pitch: 0, scan: 0.16, neck: 1.24, lean: 0.03, roll: 0, lens: 0.45, pulse: 2.2, ring: 0.6, blink: 0, bob: 0.02, bobSpeed: 2.6 },
  complete: { pitch: 0.07, scan: 0.06, neck: 1.19, lean: 0, roll: 0, lens: 0.1, pulse: 1.0, ring: 0.22, blink: 0, bob: 0.01, bobSpeed: 1.4 },
  blocked: { pitch: 0.32, scan: 0.3, neck: 1.13, lean: 0, roll: 0, lens: 1.0, pulse: 5.0, ring: 1.0, blink: 0, bob: 0.03, bobSpeed: 4 },
}

/** How dark the floor contact shadow reads per state (a local channel, so the
 * shared `POSTURE` contract stays untouched). */
const SHADOW_OPACITY: Record<AgentState, number> = {
  docked: 0.34,
  moving: 0.26,
  working: 0.42,
  reporting: 0.38,
  returning: 0.28,
  complete: 0.3,
  blocked: 0.4,
}

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
    this.root.position.set(x, ROBOT_RIDE_HEIGHT, z)
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

  /** A project finished: the robot parks with its lens dimmed. */
  markComplete() {
    this.state = 'complete'
  }

  private animate(dt: number) {
    this.root.position.set(this.x, ROBOT_RIDE_HEIGHT, this.z)
    this.root.rotation.y = this.facing

    const m = this.model
    const P = POSTURE[this.state]
    // tracks stay planted; only the chassis group breathes
    for (const w of m.leftWheels) w.rotation.x = this.wheelSpin
    for (const w of m.rightWheels) w.rotation.x = this.wheelSpin

    // suspension bob and the whole postural read, damped so a state settles
    m.body.position.y = Math.sin(this.bob * P.bobSpeed) * P.bob

    const blink = P.blink > 0 ? (Math.sin(this.bob * P.blink) > 0 ? 1 : 0.35) : 1
    m.head.rotation.y = Math.sin(this.bob * 0.8 + this.ringPhase) * P.scan
    const pitch = P.pitch + (this.state === 'working' ? Math.sin(this.bob * 5) * 0.05 : 0)
    m.head.rotation.x = damp(m.head.rotation.x, pitch, 7, dt)
    m.neck.position.y = damp(m.neck.position.y, P.neck, 6, dt)
    m.body.rotation.x = damp(m.body.rotation.x, P.lean, 6, dt)
    // idle track stance: a slow weight shift on the chassis
    const roll = P.roll + (this.state === 'docked' ? Math.sin(this.bob * 0.7) * 0.03 : 0)
    m.body.rotation.z = damp(m.body.rotation.z, roll, 5, dt)

    // contact shadow: soft, planted, and a little stronger when the robot works
    ;(m.contactShadow.material as THREE.MeshBasicMaterial).opacity =
      SHADOW_OPACITY[this.state]

    // status ring: pulses, brighter the busier the robot is
    const pulse = 0.45 + 0.35 * Math.sin(this.ringPhase * P.pulse)
    m.ringMat.opacity = 0.14 + pulse * P.ring * 0.5
    m.ringMat.color.setHex(this.accent)

    // lens is the second channel: bright while working, blinking in report,
    // almost out once the job is done
    m.lensMat.emissiveIntensity = P.lens * blink
    m.headLight.intensity = 0.4 + P.lens * 0.9 * blink
  }

  setAccent(color: number) {
    this.model.ringMat.color.setHex(color)
  }
}

export { ACCENT_BY_ROLE, ICON_BY_ROLE }
