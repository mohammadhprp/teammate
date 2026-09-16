import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { C, M } from '../core/palette'
import { roleIconTexture, type RoleIcon } from '../core/textures'
import { contactShadow } from '../core/surfaces'

/**
 * The TEAM MATE robot — one base model used by Team Mate itself and by every
 * worker agent. Only two things ever change:
 *
 *   - the accent colour of the side panels and status light
 *   - the role icon on the recessed front hatch
 *
 * Build, from the reference sheet: linked/ wheeled tracked base -> cream
 * chassis -> dark mechanical body with a recessed `▷` hatch -> binocular camera
 * head whose twin barrels dominate.
 *
 * Performance: every non-animated piece is merged per material at module load
 * and the geometry is shared by every robot (see the measured count in
 * `docs/ENTITY-ART-PLAN.md`). Only the wheels, the head, the accent panels and
 * the badge stay real child objects, because the animation drives them.
 */

/** The tracks touch the deck here; the chassis is what bobs, not the model. */
export const ROBOT_RIDE_HEIGHT = 0.07

// ---------------------------------------------------------------------------
// Geometry primitives (built once, shared by every robot)
// ---------------------------------------------------------------------------

const G = {
  belt: new RoundedBoxGeometry(0.34, 0.5, 1.06, 4, 0.16),
  link: new THREE.BoxGeometry(0.37, 0.07, 0.12),
  sprocket: new THREE.CylinderGeometry(0.19, 0.19, 0.34, 16),
  wheel: new THREE.CylinderGeometry(0.17, 0.17, 0.34, 18),
  // a wide light hub plate, so the road wheel reads against the dark belt
  hub: new THREE.CylinderGeometry(0.115, 0.115, 0.06, 16),
  chassis: new RoundedBoxGeometry(0.74, 0.42, 0.86, 3, 0.1),
  body: new RoundedBoxGeometry(0.86, 0.62, 0.78, 3, 0.12),
  shoulder: new RoundedBoxGeometry(0.16, 0.18, 0.5, 2, 0.06),
  sidePanel: new RoundedBoxGeometry(0.06, 0.44, 0.6, 2, 0.03),
  rearPanel: new RoundedBoxGeometry(0.54, 0.36, 0.07, 2, 0.03),
  recess: new RoundedBoxGeometry(0.52, 0.44, 0.09, 2, 0.04),
  panelInner: new RoundedBoxGeometry(0.42, 0.34, 0.06, 2, 0.03),
  frontPlate: new RoundedBoxGeometry(0.6, 0.3, 0.05, 2, 0.02),
  rail: new RoundedBoxGeometry(0.14, 0.14, 0.9, 2, 0.05),
  topPlate: new RoundedBoxGeometry(0.3, 0.07, 0.36, 2, 0.03),
  housing: new THREE.CylinderGeometry(0.24, 0.24, 0.5, 24),
  barrel: new THREE.CylinderGeometry(0.185, 0.185, 0.34, 20),
  barrelRing: new THREE.CylinderGeometry(0.2, 0.2, 0.045, 20),
  glass: new THREE.CylinderGeometry(0.165, 0.165, 0.03, 20),
  pupil: new THREE.CylinderGeometry(0.08, 0.08, 0.03, 14),
  band: new THREE.CylinderGeometry(0.25, 0.25, 0.12, 24),
  neck: new THREE.CylinderGeometry(0.13, 0.15, 0.16, 14),
  rod: new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6),
  tip: new THREE.SphereGeometry(0.045, 10, 8),
  screw: new THREE.CylinderGeometry(0.032, 0.032, 0.05, 8),
  badge: new THREE.PlaneGeometry(0.3, 0.3),
  ring: new THREE.RingGeometry(0.42, 0.58, 32),
  seamF: new THREE.BoxGeometry(0.78, 0.04, 0.05),
  seamS: new THREE.BoxGeometry(0.05, 0.04, 0.72),
  barH: new THREE.BoxGeometry(0.58, 0.05, 0.06),
  barV: new THREE.BoxGeometry(0.05, 0.47, 0.06),
  vent: new THREE.BoxGeometry(0.06, 0.2, 0.05),
  strip: new THREE.BoxGeometry(0.5, 0.06, 0.05),
  mount: new THREE.BoxGeometry(0.16, 0.18, 0.28),
}

type Part = {
  g: THREE.BufferGeometry
  p?: [number, number, number]
  r?: [number, number, number]
  s?: number
}

/** Bake a list of transformed clones into one geometry (bounds recomputed). */
function bake(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(({ g, p, r, s }) => {
    const geo = g.clone()
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r ?? [0, 0, 0]))),
      new THREE.Vector3().setScalar(s ?? 1),
    )
    geo.applyMatrix4(m)
    // RoundedBoxGeometry is non-indexed; merge needs every input to agree
    if (!geo.index) {
      const n = geo.getAttribute('position').count
      const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n)
      for (let i = 0; i < n; i++) arr[i] = i
      geo.setIndex(new THREE.BufferAttribute(arr, 1))
    }
    return geo
  })
  const merged = mergeGeometries(geos, false)!
  for (const g of geos) g.dispose()
  merged.computeBoundingSphere()
  return merged
}

const HPI = Math.PI / 2

// --- planted: belts, links, sprockets, hubs ---------------------------------
const beltParts: Part[] = []
const hubParts: Part[] = []
{
  const linkZ = [-0.4, -0.24, -0.08, 0.08, 0.24, 0.4]
  for (const s of [-1, 1]) {
    const cx = s * 0.42
    beltParts.push({ g: G.belt, p: [cx, 0.26, 0] })
    for (const z of linkZ) {
      beltParts.push({ g: G.link, p: [cx, 0.49, z] })
      beltParts.push({ g: G.link, p: [cx, 0.03, z] })
    }
    for (const z of [0.5, -0.5]) {
      for (const y of [-0.13, 0, 0.13]) {
        beltParts.push({ g: G.link, p: [cx, 0.26 + y, z], r: [HPI, 0, 0] })
      }
    }
    for (const z of [0.42, -0.42]) {
      beltParts.push({ g: G.sprocket, p: [cx, 0.26, z], r: [0, 0, HPI] })
    }
    for (const z of [-0.34, 0, 0.34]) {
      hubParts.push({ g: G.hub, p: [s * 0.75, 0.24, z], r: [0, 0, HPI] })
    }
  }
}

// --- chassis (the suspension group bobs; these ride with it) ----------------
const creamParts: Part[] = [
  { g: G.chassis, p: [0, 0.4, 0] },
  { g: G.body, p: [0, 0.9, 0] },
  { g: G.rearPanel, p: [0, 0.9, -0.375] },
  // inner hatch panel: dark triangle icon sits on this cream plate
  { g: G.panelInner, p: [0, 0.9, 0.365] },
  { g: G.barH, p: [0, 1.11, 0.375] },
  { g: G.barH, p: [0, 0.69, 0.375] },
  { g: G.barV, p: [-0.27, 0.9, 0.375] },
  { g: G.barV, p: [0.27, 0.9, 0.375] },
  { g: G.shoulder, p: [-0.44, 1.12, 0] },
  { g: G.shoulder, p: [0.44, 1.12, 0] },
]
const darkParts: Part[] = [
  { g: G.rail, p: [-0.3, 0.2, 0] },
  { g: G.rail, p: [0.3, 0.2, 0] },
  { g: G.frontPlate, p: [0, 0.4, 0.44] },
  { g: G.recess, p: [0, 0.9, 0.345] },
  { g: G.seamF, p: [0, 0.61, 0.375] },
  { g: G.seamF, p: [0, 0.61, -0.375] },
  { g: G.seamS, p: [-0.4, 0.61, 0] },
  { g: G.seamS, p: [0.4, 0.61, 0] },
]
for (const x of [-0.15, -0.05, 0.05, 0.15]) darkParts.push({ g: G.vent, p: [x, 0.9, -0.42] })
const steelParts: Part[] = [
  { g: G.screw, p: [-0.18, 1.04, 0.4], r: [HPI, 0, 0] },
  { g: G.screw, p: [0.18, 1.04, 0.4], r: [HPI, 0, 0] },
  { g: G.screw, p: [-0.18, 0.76, 0.4], r: [HPI, 0, 0] },
  { g: G.screw, p: [0.18, 0.76, 0.4], r: [HPI, 0, 0] },
]
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    steelParts.push({ g: G.screw, p: [sx * 0.33, 0.68, sz * 0.34], r: [HPI, 0, 0] })
    steelParts.push({ g: G.screw, p: [sx * 0.33, 1.14, sz * 0.34], r: [HPI, 0, 0] })
  }
}
const accentParts: Part[] = [
  { g: G.sidePanel, p: [-0.45, 0.9, 0] },
  { g: G.sidePanel, p: [0.45, 0.9, 0] },
  { g: G.strip, p: [0, 0.66, 0.4] },
]

// --- head (the only animated sub-tree) --------------------------------------
const headCream: Part[] = [
  { g: G.housing, p: [0, 0, 0], r: [HPI, 0, 0] },
  { g: G.topPlate, p: [0, 0.23, -0.02] },
  { g: G.barrel, p: [-0.2, 0, 0.26], r: [HPI, 0, 0] },
  { g: G.barrel, p: [0.2, 0, 0.26], r: [HPI, 0, 0] },
]
const headSteel: Part[] = [
  { g: G.barrelRing, p: [-0.2, 0, 0.42], r: [HPI, 0, 0] },
  { g: G.barrelRing, p: [0.2, 0, 0.42], r: [HPI, 0, 0] },
  { g: G.rod, p: [0.23, 0.31, -0.06], r: [0, 0, -0.22] },
]
const headDark: Part[] = [
  { g: G.band, p: [0, 0, -0.06], r: [HPI, 0, 0] },
  { g: G.mount, p: [0, 0, 0.2] },
  { g: G.pupil, p: [-0.2, 0, 0.45], r: [HPI, 0, 0] },
  { g: G.pupil, p: [0.2, 0, 0.45], r: [HPI, 0, 0] },
  // the short neck rides with the head so the joint never opens
  { g: G.neck, p: [0, -0.16, 0] },
]

const baseGeo = {
  belt: bake(beltParts),
  hub: bake(hubParts),
  cream: bake(creamParts),
  dark: bake(darkParts),
  steel: bake(steelParts),
  accent: bake(accentParts),
  headCream: bake(headCream),
  headSteel: bake(headSteel),
  headDark: bake(headDark),
  glass: bake([
    { g: G.glass, p: [-0.2, 0, 0.432], r: [HPI, 0, 0] },
    { g: G.glass, p: [0.2, 0, 0.432], r: [HPI, 0, 0] },
  ]),
}

// ---------------------------------------------------------------------------
// Per-robot materials
// ---------------------------------------------------------------------------

const accentCache = new Map<number, THREE.MeshStandardMaterial>()
function accentMat(color: number) {
  let m = accentCache.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.92),
      roughness: 0.42,
      metalness: 0.15,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.12,
    })
    accentCache.set(color, m)
  }
  return m
}

export interface RobotModel {
  root: THREE.Group
  /** Chassis + head; bobs and leans while the tracks stay planted. */
  body: THREE.Group
  head: THREE.Group
  neck: THREE.Group
  leftWheels: THREE.Mesh[]
  rightWheels: THREE.Mesh[]
  accentMat: THREE.MeshStandardMaterial
  lensMat: THREE.MeshPhysicalMaterial
  ringMat: THREE.MeshBasicMaterial
  badge: THREE.Mesh
  headLight: THREE.PointLight
  /** Soft floor blob, faded per state in `agent.ts`. */
  contactShadow: THREE.Mesh
  /** Height of the model, so other systems can place effects. */
  height: number
  setIcon(kind: RoleIcon): void
}

export function buildRobot(accentColor: number, icon: RoleIcon = 'triangle'): RobotModel {
  const root = new THREE.Group()
  const acc = accentMat(accentColor)

  // ---- planted tracked base ----------------------------------------------
  const belt = new THREE.Mesh(baseGeo.belt, M.trackRubber)
  belt.castShadow = true
  belt.receiveShadow = true
  root.add(belt)
  const hubs = new THREE.Mesh(baseGeo.hub, M.entitySteel)
  hubs.castShadow = true
  root.add(hubs)

  const leftWheels: THREE.Mesh[] = []
  const rightWheels: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    for (const z of [-0.34, 0, 0.34]) {
      const w = new THREE.Mesh(G.wheel, M.trackRubber)
      w.rotation.z = HPI
      w.position.set(s * 0.57, 0.24, z)
      w.castShadow = true
      root.add(w)
      ;(s < 0 ? leftWheels : rightWheels).push(w)
    }
  }

  // ---- suspension: only this group breathes ------------------------------
  const body = new THREE.Group()
  root.add(body)

  const cream = new THREE.Mesh(baseGeo.cream, M.plasticCream)
  cream.castShadow = true
  cream.receiveShadow = true
  body.add(cream)
  const dark = new THREE.Mesh(baseGeo.dark, M.frameDark)
  dark.castShadow = true
  dark.receiveShadow = true
  body.add(dark)
  const steel = new THREE.Mesh(baseGeo.steel, M.entitySteel)
  body.add(steel)
  const accents = new THREE.Mesh(baseGeo.accent, acc)
  accents.castShadow = true
  body.add(accents)

  // front hatch badge carrying the role icon
  const badgeMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  const badge = new THREE.Mesh(G.badge, badgeMat)
  badge.position.set(0, 0.9, 0.4)
  badge.renderOrder = 2
  body.add(badge)

  // ---- head ---------------------------------------------------------------
  const neck = new THREE.Group()
  neck.position.set(0, 1.24, 0)
  body.add(neck)
  const head = new THREE.Group()
  head.position.set(0, 0.16, 0)
  neck.add(head)

  const headShell = new THREE.Mesh(baseGeo.headCream, M.plasticCream)
  headShell.castShadow = true
  head.add(headShell)
  head.add(new THREE.Mesh(baseGeo.headDark, M.frameDark))
  head.add(new THREE.Mesh(baseGeo.headSteel, M.entitySteel))

  const lensMat = M.lensGlass.clone()
  lensMat.emissive = new THREE.Color(C.cyan)
  lensMat.emissiveIntensity = 0.35
  head.add(new THREE.Mesh(baseGeo.glass, lensMat))

  const tip = new THREE.Mesh(G.tip, M.glow(accentColor, 1.8))
  tip.position.set(0.276, 0.51, -0.06)
  head.add(tip)

  const headLight = new THREE.PointLight(accentColor, 0.6, 3.4, 2)
  headLight.position.set(0, 0, 0.5)
  head.add(headLight)

  // ---- status ring + contact shadow, both planted -------------------------
  const ringMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const ring = new THREE.Mesh(G.ring, ringMat)
  ring.rotation.x = -HPI
  ring.position.y = -0.008
  ring.renderOrder = 3
  root.add(ring)

  const shadow = contactShadow(0.95, 1.25, 0.38)
  shadow.position.y = -0.014
  root.add(shadow)

  const model: RobotModel = {
    root,
    body,
    head,
    neck,
    leftWheels,
    rightWheels,
    accentMat: acc,
    lensMat,
    ringMat,
    badge,
    headLight,
    contactShadow: shadow,
    height: 1.7,
    setIcon(kind: RoleIcon) {
      const tex = roleIconTexture(kind, 0x3a3e42)
      const mat = badge.material as THREE.MeshBasicMaterial
      if (mat.map) mat.map.dispose()
      mat.map = tex
      mat.transparent = true
      mat.needsUpdate = true
    },
  }
  model.setIcon(icon)
  return model
}

/** Team Mate wears the default `▷` hatch icon and a taller antenna. */
export function buildTeamMate(accentColor: number = C.cyan): RobotModel {
  const model = buildRobot(accentColor, 'triangle')
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), M.entitySteel)
  rod.position.set(-0.2, 0.42, -0.1)
  rod.rotation.z = 0.3
  model.head.add(rod)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.glow(C.cyan, 2))
  tip.position.set(-0.3, 0.66, -0.1)
  model.head.add(tip)
  return model
}
