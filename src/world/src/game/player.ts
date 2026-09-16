import * as THREE from 'three'
import { buildDeveloper } from '../entities/developer'
import type { Agent } from '../entities/agent'
import type { Input } from '../core/input'
import type { Ship } from '../world/ship'
import { canStand } from '../world/nav'
import { clamp, damp } from '../core/math'
import { angleDelta } from '../core/math'

export type CameraMode = 'follow' | 'wide' | 'top'

const MODES: Record<CameraMode, { dist: number; pitch: number; height: number }> = {
  follow: { dist: 7.4, pitch: -0.24, height: 2.1 },
  wide: { dist: 15, pitch: -0.42, height: 4.4 },
  top: { dist: 26, pitch: -1.05, height: 8 },
}

/**
 * The developer, floating around their own ship in the command pod.
 *
 * Movement is camera relative; the pod banks into turns and hovers; collision
 * is resolved against the ship's walkable union and its solid props, so you can
 * walk corridors, slide along walls and never clip into a server cabinet.
 */
export class Player {
  readonly root: THREE.Group
  readonly avatar = buildDeveloper()
  readonly camera: THREE.PerspectiveCamera

  x = -14.5
  z = 204
  heading = 0
  camYaw = 0
  camPitch = -0.24
  mode: CameraMode = 'follow'
  moving = 0
  speed = 12
  radius = 1.5
  /** When set, the camera orbits this robot instead of the pod. */
  focusTarget: Agent | null = null

  private vx = 0
  private vz = 0
  private bob = 0
  private camDist = 7.4
  private focusDist = 6.5
  private shake = 0
  /** Player-relative camera target, damped for a soft follow. */
  private focus = new THREE.Vector3(-14.5, 2, 204)

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
    this.root = this.avatar.root
    this.root.position.set(this.x, 0.9, this.z)
  }

  setPosition(x: number, z: number, heading = 0, camYaw = heading) {
    this.x = x
    this.z = z
    this.heading = heading
    this.camYaw = camYaw
    this.focus.set(x, 2, z)
    this.camera.position.set(
      x + Math.sin(camYaw) * 7,
      4.2,
      z + Math.cos(camYaw) * 7,
    )
    this.camera.lookAt(x, 2.4, z)
  }

  cycleCamera() {
    this.mode = this.mode === 'follow' ? 'wide' : this.mode === 'wide' ? 'top' : 'follow'
    return this.mode
  }

  /** Lock the camera onto a robot so the developer can watch it work. */
  focusAgent(agent: Agent) {
    this.focusTarget = agent
    this.focusDist = 6.5
    this.camPitch = -0.22
    this.focus.set(agent.x, 1.35, agent.z)
  }

  releaseFocus() {
    this.focusTarget = null
  }

  get focused() {
    return this.focusTarget !== null
  }

  update(dt: number, input: Input, ship: Ship) {
    const speedMul = input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? 1.75 : 1
    // --- look ---------------------------------------------------------------
    if (input.pointerLocked) {
      const sens = 0.0026
      this.camYaw -= input.mouseDX * sens
      this.camPitch = clamp(this.camPitch - input.mouseDY * sens, -1.35, 0.42)
    }
    if (input.wheel) {
      if (this.focusTarget) this.focusDist = clamp(this.focusDist + input.wheel * 0.01, 3, 16)
      else this.camDist = clamp(this.camDist + input.wheel * 0.01, 3.4, 30)
    }

    // While inspecting a robot the pod holds still and the camera orbits it.
    if (this.focusTarget) {
      this.updateFocus(dt, ship)
      return
    }

    // --- move (camera relative) --------------------------------------------
    const fwd = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp')
    const strafe = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight')
    const len = Math.hypot(fwd, strafe)
    let dirX = 0
    let dirZ = 0
    if (len > 0) {
      const nf = fwd / Math.max(1, len)
      const ns = strafe / Math.max(1, len)
      const sinY = Math.sin(this.camYaw)
      const cosY = Math.cos(this.camYaw)
      // camera forward is -Z rotated by yaw
      dirX = -sinY * nf + cosY * ns
      dirZ = -cosY * nf - sinY * ns
    }

    const targetSpeed = this.speed * speedMul * (len > 0 ? 1 : 0)
    this.vx = damp(this.vx, dirX * targetSpeed, 7, dt)
    this.vz = damp(this.vz, dirZ * targetSpeed, 7, dt)

    const nx = this.x + this.vx * dt
    const nz = this.z + this.vz * dt
    if (canStand(ship.walkable, ship.obstacles, nx, nz, this.radius)) {
      this.x = nx
      this.z = nz
    } else if (canStand(ship.walkable, ship.obstacles, nx, this.z, this.radius)) {
      this.x = nx
      this.vz *= 0.4
    } else if (canStand(ship.walkable, ship.obstacles, this.x, nz, this.radius)) {
      this.z = nz
      this.vx *= 0.4
    } else {
      this.vx *= 0.2
      this.vz *= 0.2
    }

    const speed = Math.hypot(this.vx, this.vz)
    this.moving = damp(this.moving, speed / this.speed, 6, dt)
    if (speed > 0.4) {
      const want = Math.atan2(this.vx, this.vz)
      this.heading += angleDelta(this.heading, want) * Math.min(1, dt * 6)
    }

    // --- pose ---------------------------------------------------------------
    this.bob += dt
    const hover = 0.9 + Math.sin(this.bob * 1.6) * 0.07 + this.moving * 0.1
    this.root.position.set(this.x, hover, this.z)
    // the pod hovers; its contact shadow stays on the deck
    this.avatar.contactShadow.position.y = 0.06 - hover
    this.root.rotation.y = this.heading
    this.root.rotation.z = damp(this.root.rotation.z, -angleDelta(this.heading, Math.atan2(this.vx, this.vz)) * 0.25 * this.moving, 4, dt)
    this.root.rotation.x = damp(this.root.rotation.x, this.moving * 0.09, 4, dt)
    this.avatar.body.rotation.x = damp(this.avatar.body.rotation.x, this.moving * 0.08, 3, dt)
    this.avatar.head.rotation.y = Math.sin(this.bob * 0.5) * 0.06

    // --- camera -------------------------------------------------------------
    const preset = MODES[this.mode]
    const dist = this.mode === 'follow' ? this.camDist : preset.dist
    const pitch = this.mode === 'follow' ? this.camPitch : preset.pitch
    const pitchBlend = this.mode === 'follow' ? pitch : this.camPitch * 0.35 + pitch * 0.65

    this.focus.x = damp(this.focus.x, this.x, 9, dt)
    this.focus.z = damp(this.focus.z, this.z, 9, dt)
    this.focus.y = damp(this.focus.y, hover + 1.5, 6, dt)

    const cp = Math.cos(pitchBlend)
    const offX = Math.sin(this.camYaw) * cp * dist
    const offZ = Math.cos(this.camYaw) * cp * dist
    const offY = -Math.sin(pitchBlend) * dist + (this.mode === 'follow' ? 0 : preset.height * 0.3)

    this.settleCamera(this.focus.x, this.focus.y, this.focus.z, offX, offY, offZ, dist, dt, ship)
  }

  /** Orbit the focused robot, reusing the same collision pull-in as the pod. */
  private updateFocus(dt: number, ship: Ship) {
    const a = this.focusTarget!
    this.focus.x = damp(this.focus.x, a.x, 12, dt)
    this.focus.z = damp(this.focus.z, a.z, 12, dt)
    this.focus.y = damp(this.focus.y, 1.35, 10, dt)

    this.bob += dt
    this.root.position.y = 0.9 + Math.sin(this.bob * 1.6) * 0.07
    this.avatar.contactShadow.position.y = 0.06 - this.root.position.y
    this.avatar.head.rotation.y = Math.sin(this.bob * 0.5) * 0.06

    const cp = Math.cos(this.camPitch)
    const offX = Math.sin(this.camYaw) * cp * this.focusDist
    const offZ = Math.cos(this.camYaw) * cp * this.focusDist
    const offY = -Math.sin(this.camPitch) * this.focusDist
    this.settleCamera(
      this.focus.x,
      this.focus.y,
      this.focus.z,
      offX,
      offY,
      offZ,
      this.focusDist,
      dt,
      ship,
    )
  }

  /**
   * Place the camera behind the focus point, pulling it in until it sits in
   * walkable space and out of chunky furniture, and lifting it when squeezed so
   * it never ends up inside a wall or floor.
   */
  private settleCamera(
    fx: number,
    fy: number,
    fz: number,
    offX: number,
    offY: number,
    offZ: number,
    dist: number,
    dt: number,
    ship: Ship,
  ) {
    const blockedBy = (px: number, pz: number) =>
      ship.obstacles.some((o) => {
        if (o.kind === 'circle') {
          if (o.r >= 3.5) return false
          return Math.hypot(px - o.x, pz - o.z) < o.r + 0.5
        }
        const area = (o.maxX - o.minX) * (o.maxZ - o.minZ)
        if (area >= 60) return false
        return (
          px > o.minX - 0.5 && px < o.maxX + 0.5 && pz > o.minZ - 0.5 && pz < o.maxZ + 0.5
        )
      })

    let d = dist
    for (let i = 0; i < 20; i++) {
      const px = fx + (offX / dist) * d
      const pz = fz + (offZ / dist) * d
      const inside = ship.walkable.rects.some(
        (r) => px > r.minX && px < r.maxX && pz > r.minZ && pz < r.maxZ,
      )
      const insideCircle = ship.walkable.circles.some((c) => Math.hypot(px - c.x, pz - c.z) < c.r)
      if ((inside || insideCircle) && !blockedBy(px, pz)) break
      d -= dist * 0.05
      if (d < 3.2) {
        d = 2.8
        break
      }
    }
    const k = d / dist
    const tight = clamp(1 - k * 1.35, 0, 1)
    const px = fx + offX * k
    const pz = fz + offZ * k
    const py = Math.max(1.4, fy + offY * k + tight * 4.2)

    this.camera.position.x = damp(this.camera.position.x, px, 10, dt)
    this.camera.position.y = damp(this.camera.position.y, py, 10, dt)
    this.camera.position.z = damp(this.camera.position.z, pz, 10, dt)
    this.camera.lookAt(fx, fy + 0.4, fz)
    this.shake = damp(this.shake, 0, 6, dt)
    if (this.shake > 0.001) {
      this.camera.position.y += Math.sin(this.bob * 40) * this.shake
    }
  }

  nudge(amount: number) {
    this.shake = amount
  }
}
