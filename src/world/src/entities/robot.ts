import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { C, M } from '../core/palette'
import { roleIconTexture, type RoleIcon } from '../core/textures'

/**
 * The TEAM MATE robot — one base model used by Team Mate itself and by every
 * worker agent. Only two things ever change:
 *
 *   - the accent colour of the side panels and status light
 *   - the role icon on the front plate
 *
 * Build, from the reference sheet: tracked base -> cream chassis -> dark
 * mechanical body -> binocular camera head on a short neck.
 */

const geo = {
  track: new RoundedBoxGeometry(0.34, 0.5, 1.06, 2, 0.12),
  wheel: new THREE.CylinderGeometry(0.15, 0.15, 0.36, 14),
  tread: new THREE.BoxGeometry(0.36, 0.09, 0.12),
  chassis: new RoundedBoxGeometry(0.74, 0.42, 0.86, 2, 0.08),
  body: new RoundedBoxGeometry(0.86, 0.62, 0.78, 2, 0.1),
  panel: new RoundedBoxGeometry(0.9, 0.4, 0.06, 2, 0.03),
  sidePanel: new RoundedBoxGeometry(0.06, 0.44, 0.6, 2, 0.03),
  neck: new THREE.CylinderGeometry(0.13, 0.15, 0.16, 12),
  head: new THREE.CylinderGeometry(0.25, 0.25, 0.56, 20),
  headCap: new THREE.CylinderGeometry(0.26, 0.26, 0.06, 20),
  lens: new THREE.CylinderGeometry(0.155, 0.16, 0.18, 18),
  lensGlass: new THREE.CylinderGeometry(0.13, 0.13, 0.04, 18),
  lensInner: new THREE.CylinderGeometry(0.07, 0.07, 0.03, 12),
  screw: new THREE.CylinderGeometry(0.032, 0.032, 0.04, 8),
  rod: new THREE.CylinderGeometry(0.022, 0.022, 0.34, 6),
  tip: new THREE.SphereGeometry(0.045, 10, 8),
  shoulder: new RoundedBoxGeometry(0.16, 0.18, 0.5, 2, 0.05),
  badge: new THREE.PlaneGeometry(0.42, 0.42),
  ring: new THREE.RingGeometry(0.42, 0.58, 32),
  vent: new THREE.BoxGeometry(0.36, 0.04, 0.03),
}

const accentCache = new Map<number, THREE.MeshStandardMaterial>()
function accentMat(color: number) {
  let m = accentCache.get(color)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.92),
      roughness: 0.42,
      metalness: 0.15,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.1,
    })
    accentCache.set(color, m)
  }
  return m
}

export interface RobotModel {
  root: THREE.Group
  head: THREE.Group
  neck: THREE.Group
  leftWheels: THREE.Mesh[]
  rightWheels: THREE.Mesh[]
  accentMat: THREE.MeshStandardMaterial
  lensMat: THREE.MeshStandardMaterial
  ringMat: THREE.MeshBasicMaterial
  badge: THREE.Mesh
  headLight: THREE.PointLight
  /** Height of the model, so other systems can place effects. */
  height: number
  setIcon(kind: RoleIcon): void
}

export function buildRobot(accentColor: number, icon: RoleIcon = 'none'): RobotModel {
  const root = new THREE.Group()
  const acc = accentMat(accentColor)

  // ---- tracked base -------------------------------------------------------
  const leftWheels: THREE.Mesh[] = []
  const rightWheels: THREE.Mesh[] = []
  for (const s of [-1, 1]) {
    const track = new THREE.Group()
    track.position.set(s * 0.42, 0.26, 0)
    const shell = new THREE.Mesh(geo.track, M.darker)
    shell.castShadow = true
    shell.receiveShadow = true
    track.add(shell)
    // wheels on the outer face + treads on the belt
    for (let i = -1; i <= 1; i++) {
      const w = new THREE.Mesh(geo.wheel, M.black)
      w.rotation.z = Math.PI / 2
      w.position.set(s * 0.19, -0.02, i * 0.34)
      track.add(w)
      ;(s < 0 ? leftWheels : rightWheels).push(w)
    }
    for (let i = 0; i < 7; i++) {
      const t = new THREE.Mesh(geo.tread, M.black)
      t.position.set(0, 0.24, -0.42 + i * 0.14)
      track.add(t)
      const b = new THREE.Mesh(geo.tread, M.black)
      b.position.set(0, -0.24, -0.42 + i * 0.14)
      track.add(b)
    }
    root.add(track)
  }

  // ---- chassis ------------------------------------------------------------
  const chassis = new THREE.Mesh(geo.chassis, M.hullSoft)
  chassis.position.set(0, 0.4, 0)
  chassis.castShadow = true
  root.add(chassis)
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.14, 0.9, 1, 0.04), M.dark)
    rail.position.set(s * 0.3, 0.2, 0)
    root.add(rail)
  }
  const frontPlate = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.3, 0.05, 1, 0.02), M.dark)
  frontPlate.position.set(0, 0.4, 0.44)
  root.add(frontPlate)
  const frontLight = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.03), M.glow(accentColor, 1.2))
  frontLight.position.set(0, 0.52, 0.46)
  root.add(frontLight)

  // ---- body ---------------------------------------------------------------
  const body = new THREE.Mesh(geo.body, M.hullSoft)
  body.position.set(0, 0.9, 0)
  body.castShadow = true
  body.receiveShadow = true
  root.add(body)

  // front plate carrying the role icon
  const plate = new THREE.Mesh(geo.panel, M.hull)
  plate.position.set(0, 0.9, 0.4)
  root.add(plate)
  const badgeMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  const badge = new THREE.Mesh(geo.badge, badgeMat)
  badge.position.set(0, 0.9, 0.435)
  root.add(badge)

  // side accent panels
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(geo.sidePanel, acc)
    panel.position.set(s * 0.45, 0.9, 0)
    root.add(panel)
    const shoulder = new THREE.Mesh(geo.shoulder, M.dark)
    shoulder.position.set(s * 0.44, 1.12, 0)
    root.add(shoulder)
    const screw = new THREE.Mesh(geo.screw, M.steel)
    screw.rotation.z = Math.PI / 2
    screw.position.set(s * 0.47, 0.72, 0.25)
    root.add(screw)
  }

  // detail: vents, corner screws, panel seams
  for (let i = 0; i < 4; i++) {
    const v = new THREE.Mesh(geo.vent, M.darker)
    v.position.set(-0.18 + i * 0.12, 1.15, 0.41)
    root.add(v)
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const s = new THREE.Mesh(geo.screw, M.steel)
      s.rotation.x = Math.PI / 2
      s.position.set(sx * 0.33, 0.68, sz * 0.34)
      root.add(s)
      const s2 = new THREE.Mesh(geo.screw, M.steel)
      s2.rotation.x = Math.PI / 2
      s2.position.set(sx * 0.33, 1.14, sz * 0.34)
      root.add(s2)
    }
  }
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.04), M.darker)
  seam.position.set(0, 1.15, -0.4)
  root.add(seam)

  // status ring on the floor, always faces up
  const ringMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(geo.ring, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.03
  root.add(ring)

  // ---- head ---------------------------------------------------------------
  const neck = new THREE.Group()
  neck.position.set(0, 1.24, 0)
  const neckMesh = new THREE.Mesh(geo.neck, M.dark)
  neck.add(neckMesh)
  const head = new THREE.Group()
  head.position.set(0, 0.16, 0)

  const housing = new THREE.Mesh(geo.head, M.hullSoft)
  housing.rotation.x = Math.PI / 2
  housing.castShadow = true
  head.add(housing)
  for (const s of [-1, 1]) {
    const cap = new THREE.Mesh(geo.headCap, M.dark)
    cap.rotation.x = Math.PI / 2
    cap.position.z = s * 0.29
    head.add(cap)
  }
  // dark banding + top plate detail
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 20), M.dark)
  band.rotation.x = Math.PI / 2
  head.add(band)
  const topPlate = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.06, 0.3, 1, 0.02), M.hull)
  topPlate.position.y = 0.25
  head.add(topPlate)

  // the two camera barrels
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f33,
    roughness: 0.3,
    metalness: 0.6,
    emissive: new THREE.Color(C.cyan),
    emissiveIntensity: 0.35,
  })
  for (const s of [-1, 1]) {
    const barrel = new THREE.Mesh(geo.lens, M.darker)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(s * 0.19, 0, 0.32)
    head.add(barrel)
    const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18), M.steel)
    ring2.rotation.x = Math.PI / 2
    ring2.position.set(s * 0.19, 0, 0.41)
    head.add(ring2)
    const glass = new THREE.Mesh(geo.lensGlass, lensMat)
    glass.rotation.x = Math.PI / 2
    glass.position.set(s * 0.19, 0, 0.42)
    head.add(glass)
    const inner = new THREE.Mesh(geo.lensInner, M.black)
    inner.rotation.x = Math.PI / 2
    inner.position.set(s * 0.19, 0, 0.445)
    head.add(inner)
  }
  // antenna
  const rod = new THREE.Mesh(geo.rod, M.steel)
  rod.position.set(0.2, 0.34, -0.1)
  rod.rotation.z = -0.25
  head.add(rod)
  const tip = new THREE.Mesh(geo.tip, M.glow(accentColor, 1.8))
  tip.position.set(0.28, 0.5, -0.1)
  head.add(tip)

  // camera light: tiny, so a robot walking past lights its own face
  const headLight = new THREE.PointLight(accentColor, 0.6, 3.4, 2)
  headLight.position.set(0, 0, 0.5)
  head.add(headLight)

  neck.add(head)
  root.add(neck)

  let iconMesh: THREE.Mesh | null = null
  const model: RobotModel = {
    root,
    head,
    neck,
    leftWheels,
    rightWheels,
    accentMat: acc,
    lensMat,
    ringMat,
    badge,
    headLight,
    height: 1.7,
    setIcon(kind: RoleIcon) {
      const tex = roleIconTexture(kind, 0x3a3e42)
      const mat = badge.material as THREE.MeshBasicMaterial
      if (mat.map) mat.map.dispose()
      mat.map = tex
      mat.transparent = true
      mat.needsUpdate = true
      iconMesh = badge
      void iconMesh
    },
  }
  model.setIcon(icon)
  return model
}

/** Team Mate wears no role icon — it gets a small double-ring crest instead. */
export function buildTeamMate(accentColor: number = C.cyan): RobotModel {
  const model = buildRobot(accentColor, 'none')
  const crest = new THREE.Mesh(
    new THREE.TorusGeometry(0.14, 0.035, 8, 20),
    M.glow(C.cyan, 1.2),
  )
  crest.position.set(0, 0.9, 0.435)
  model.root.add(crest)
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), M.glow(C.cyan, 1.6))
  dot.position.set(0, 0.9, 0.44)
  model.root.add(dot)
  // a slightly taller antenna, so the orchestrator stands out from workers
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), M.steel)
  rod.position.set(-0.16, 0.42, -0.12)
  rod.rotation.z = 0.3
  model.head.add(rod)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.glow(C.cyan, 2))
  tip.position.set(-0.28, 0.63, -0.12)
  model.head.add(tip)
  return model
}
