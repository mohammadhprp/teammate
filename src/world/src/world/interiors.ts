import * as THREE from 'three'
import { ACCENT, C, M, type AccentName } from '../core/palette'
import { roleIconTexture, signTexture } from '../core/textures'
import type { AgentRole } from './layout'
import {
  anchor,
  box,
  ChargingStation,
  CommunicationTerminal,
  ComputerTerminal,
  ControlPanel,
  cyl,
  DockingStation,
  HoloBoard,
  HolographicProjector,
  InterfaceHologram,
  MaintenanceBerth,
  MechanicalPanel,
  MissionDisplay,
  Plant,
  plane,
  rbox,
  ReviewBoard,
  RoboticArm,
  ServerCabinet,
  SimulationChamber,
  solidBox,
  solidCircle,
  SpareRobotParts,
  StatusPylon,
  StorageContainer,
  tube,
  Workbench,
  type PropCtx,
} from './props'

/**
 * Room furnishing.
 *
 * Every room is dressed from the same reusable prop kit, so the ship reads as
 * one product line: workstations look like workstations, docking bays look like
 * docking bays, and each lab only changes accent colour, signage and equipment.
 *
 * Each furnisher also registers the *anchors* robots and the developer interact
 * with, which is how room dressing and navigation stay in sync.
 */

const ROLE_ICON: Record<AgentRole, 'gear' | 'code' | 'check' | 'flask'> = {
  backend: 'gear',
  frontend: 'code',
  review: 'check',
  test: 'flask',
}

const signCache = new Map<string, THREE.Texture>()
function signTextureCached(title: string, subtitle: string, accent: number) {
  const key = `${title}|${subtitle}|${accent}`
  let t = signCache.get(key)
  if (!t) {
    t = signTexture(title, subtitle, accent)
    signCache.set(key, t)
  }
  return t
}

const iconCache = new Map<string, THREE.Texture>()
function roleIconTextureCached(kind: 'gear' | 'code' | 'check' | 'flask', color: number) {
  const key = `${kind}|${color}`
  let t = iconCache.get(key)
  if (!t) {
    t = roleIconTexture(kind, color)
    iconCache.set(key, t)
  }
  return t
}

/** A wall-mounted sign whose label can be replaced when a project moves in. */
export function makeSign(
  ctx: PropCtx,
  name: string,
  x: number,
  y: number,
  z: number,
  ry: number,
  title: string,
  subtitle: string,
  accent: number,
) {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.rotation.y = ry
  const board = new THREE.Mesh(rbox(6.6, 2.3, 0.32, 0.12), M.darker)
  board.castShadow = true
  const face = new THREE.Mesh(
    plane(6.0, 1.9),
    new THREE.MeshBasicMaterial({ map: signTextureCached(title, subtitle, accent) }),
  )
  face.position.z = 0.18
  group.add(board, face)
  group.userData.face = face
  group.userData.label = (t: string, s: string, a: number) => {
    const mat = face.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    mat.map = signTextureCached(t, s, a)
    mat.needsUpdate = true
  }
  ctx.register(name, group)
  return group
}

// ---------------------------------------------------------------------------
// COMMAND DECK — where the developer works and Team Mate reports
// ---------------------------------------------------------------------------

function furnishCommand(ctx: PropCtx, roomId: string) {
  const cx = 0
  const cz = 226

  // Team Mate's dais at the centre of the room
  ctx.batch.at(cyl(5.4, 5.9, 0.36, 40), M.hullSoft, cx, 0.18, cz)
  ctx.batch.at(cyl(5.0, 5.0, 0.12, 40), M.floorPanel, cx, 0.4, cz)
  ctx.batch.at(cyl(5.55, 5.55, 0.06, 40), M.glow(C.cyan, 1.2), cx, 0.38, cz)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    ctx.batch.at(box(0.3, 0.3, 0.3), M.dark, cx + Math.sin(a) * 4.6, 0.55, cz + Math.cos(a) * 4.6)
  }
  solidCircle(ctx, cx, cz, 6.0)
  anchor(ctx, 'tm:command', roomId, 'tm', cx, cz + 0.3, [0, 1])
  anchor(ctx, 'talk:command', roomId, 'talk', cx, cz + 7.6, [0, -1])

  // the developer's console, west of the dais, facing the windows
  ctx.batch.at(rbox(11.5, 0.3, 2.0, 0.12), M.hullSoft, -14.5, 1.1, 216, 0.5)
  ctx.batch.at(box(11.0, 0.95, 1.7), M.hull, -14.5, 0.55, 216, 0.5)
  ctx.batch.at(box(11.2, 0.1, 0.14), M.glow(C.cyan, 0.9), -14.5, 1.0, 214.7, 0.5)
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.62
    const px = -14.5 + Math.sin(a) * 6.6
    const pz = 216 + Math.cos(a) * 6.6
    const panel = new THREE.Mesh(plane(2.6, 1.6), M.holo(C.cyan, 0.2))
    panel.position.set(px, 3.2, pz)
    panel.rotation.y = a
    ctx.register(`holo:dev:${i}`, panel)
    ctx.batch.at(box(0.08, 0.08, 2.8), M.dark, px, 4.05, pz, a)
  }
  solidBox(ctx, -14.5, 216, 13, 3.4)
  anchor(ctx, 'desk:command', roomId, 'desk', -14.5, 212, [0, 1])

  // holographic project table, east of the dais
  ctx.batch.at(cyl(3.4, 3.8, 0.9, 32), M.hull, 14.5, 0.45, 220)
  ctx.batch.at(cyl(3.5, 3.5, 0.16, 32), M.hullSoft, 14.5, 0.98, 220)
  ctx.batch.at(cyl(3.1, 3.1, 0.08, 32), M.glow(C.cyan, 1.0), 14.5, 1.06, 220)
  solidCircle(ctx, 14.5, 220, 3.9)
  const projectHolo = HoloBoard(ctx, 'holo:command', 14.5, 3.9, 220, -0.3, 'cyan', 7.2, 4.0)
  projectHolo.userData.kind = 'command'

  // flanking consoles, storage and dressing
  ComputerTerminal(ctx, -7.5, 207.8, -0.35, 'cyan', 'pillar')
  ComputerTerminal(ctx, 7.5, 207.8, 0.35, 'cyan', 'pillar')
  ControlPanel(ctx, -18.5, 232, 1.1, 'cyan')
  ControlPanel(ctx, 18.5, 232, -1.1, 'cyan')
  StorageContainer(ctx, -19.5, 240, 0.4, 2.6)
  StorageContainer(ctx, -16.4, 241.5, 0.4, 2.2)
  StorageContainer(ctx, 19.5, 240, -0.4, 2.6)
  CommunicationTerminal(ctx, 20.5, 215, Math.PI / 2)
  MechanicalPanel(ctx, 'mech:command:a', -22.2, 212, Math.PI / 2, 'cyan')
  MechanicalPanel(ctx, 'mech:command:b', 22.2, 208, -Math.PI / 2, 'cyan')
  Plant(ctx, -21, 228.5, 1.5)
  Plant(ctx, 21, 230, 1.3)
  Plant(ctx, 6.4, 206.5, 1.1)
  Plant(ctx, -6.4, 206.5, 1.1)
  StatusPylon(ctx, 'pylon:command', 0, 208.8, 'cyan')
}

// ---------------------------------------------------------------------------
// TEAM MATE HQ — the brain of the ship
// ---------------------------------------------------------------------------

function furnishHQ(ctx: PropCtx, roomId: string) {
  const cz = -58
  ctx.batch.at(cyl(6.6, 7.2, 0.7, 48), M.hullSoft, 0, 0.35, cz)
  ctx.batch.at(cyl(6.0, 6.0, 0.18, 48), M.floorPanel, 0, 0.78, cz)
  ctx.batch.at(cyl(6.85, 6.85, 0.08, 48), M.glow(C.cyan, 1.3), 0, 0.72, cz)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.batch.at(box(0.4, 0.5, 0.4), M.dark, Math.sin(a) * 5.6, 1.0, cz + Math.cos(a) * 5.6)
  }
  solidCircle(ctx, 0, cz, 7.4)
  anchor(ctx, 'tm:hq', roomId, 'tm', 0, cz, [0, 1])
  anchor(ctx, 'talk:hq', roomId, 'talk', 0, cz + 9.6, [0, -1])

  // four agent berths around the dais, joined to it by glowing rails
  const bays: [number, number][] = [
    [-11, cz - 8],
    [11, cz - 8],
    [-11, cz + 8],
    [11, cz + 8],
  ]
  bays.forEach(([bx, bz], i) => {
    const dz = bz - cz
    const len = Math.hypot(bx, dz)
    const ang = Math.atan2(bx, dz)
    ctx.batch.at(box(0.16, 0.05, len), M.glow(C.cyan, 0.8), bx / 2, 0.06, cz + dz / 2, ang)
    DockingStation(ctx, `hq${i}`, roomId, bx, bz, ang, 'cyan', 'berth')
    ChargingStation(ctx, bx * 1.5, bz, ang + Math.PI, 'cyan', `hq${i}`)
  })

  // holographic mission ring
  for (let i = 0; i < 5; i++) {
    const a = -1.15 + i * 0.575
    const px = Math.sin(a) * 11
    const pz = cz + Math.cos(a) * 11
    const board = HoloBoard(ctx, `holo:hq:${i}`, px, 4.4, pz, a + Math.PI, 'cyan', 4.6, 2.8)
    board.userData.kind = 'hq-board'
    board.userData.index = i
  }

  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i / 4) * Math.PI * 2
    ComputerTerminal(ctx, Math.sin(a) * 14, cz + Math.cos(a) * 14, a + Math.PI, 'cyan', 'pillar')
  }
  HolographicProjector(ctx, 0, cz, 'cyan', 1.7)
  Planter(ctx, -14.2, cz - 5.5)
  Planter(ctx, 14.2, cz + 5.5)
  StatusPylon(ctx, 'pylon:hq', 0, cz - 13.6, 'cyan')
}

function Planter(ctx: PropCtx, x: number, z: number) {
  ctx.batch.at(cyl(1.5, 1.2, 0.8, 20), M.hullSoft, x, 0.4, z)
  ctx.batch.at(tube(1.5, 0.08, 24), M.steel, x, 0.82, z, 0, Math.PI / 2)
  Plant(ctx, x, z, 1.6)
}

// ---------------------------------------------------------------------------
// MISSION CONTROL — the state of the whole ship
// ---------------------------------------------------------------------------

function furnishMission(ctx: PropCtx, roomId: string) {
  const cz = -124
  ctx.batch.at(cyl(5.6, 6.2, 0.6, 40), M.hull, 0, 0.3, cz)
  ctx.batch.at(cyl(5.0, 5.0, 0.14, 40), M.hullSoft, 0, 0.66, cz)
  ctx.batch.at(cyl(5.4, 5.4, 0.08, 40), M.glow(C.cyan, 1.2), 0, 0.62, cz)
  solidCircle(ctx, 0, cz, 6.4)
  anchor(ctx, 'mission:center', roomId, 'mission', 0, cz + 7.4, [0, -1])

  const globe = new THREE.Group()
  globe.position.set(0, 4.4, cz)
  const wire = new THREE.Mesh(new THREE.SphereGeometry(3.2, 22, 14), M.holo(C.cyan, 0.12))
  const ring1 = new THREE.Mesh(tube(3.7, 0.05, 40), M.holo(C.cyan, 0.6))
  const ring2 = new THREE.Mesh(tube(3.7, 0.05, 40), M.holo(C.cyan, 0.4))
  ring1.rotation.x = Math.PI / 2
  ring2.rotation.z = Math.PI / 2.4
  const markers: THREE.Mesh[] = []
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const m = new THREE.Mesh(box(0.42, 0.42, 0.42), M.holo(C.cyan, 0.85))
    m.position.set(Math.sin(a) * 3.2, Math.cos(a * 1.7) * 1.7, Math.cos(a) * 3.2)
    markers.push(m)
  }
  globe.add(wire, ring1, ring2, ...markers)
  globe.userData.markers = markers
  globe.userData.ring1 = ring1
  globe.userData.ring2 = ring2
  ctx.register('holo:mission:globe', globe)

  MissionDisplay(ctx, 'screen:mission:main', 0, cz - 18.2, 0, 'cyan', 14, 5.2)
  MissionDisplay(ctx, 'screen:mission:w', -16.2, cz + 2, Math.PI / 2 - 0.5, 'cyan', 7, 3.4)
  MissionDisplay(ctx, 'screen:mission:e', 16.2, cz + 2, -Math.PI / 2 + 0.5, 'cyan', 7, 3.4)

  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45
    ControlPanel(ctx, Math.sin(a) * 13.5, cz + Math.cos(a) * 13.5, a + Math.PI, 'cyan')
  }
  for (let i = 0; i < 3; i++) {
    const a = Math.PI - 0.6 + i * 0.6
    ComputerTerminal(ctx, Math.sin(a) * 12, cz + Math.cos(a) * 12, a, 'cyan', 'pillar')
  }
  Planter(ctx, -14, cz - 8.5)
  Planter(ctx, 14, cz - 8.5)
  StatusPylon(ctx, 'pylon:mission', 0, cz + 15.6, 'cyan')
}

// ---------------------------------------------------------------------------
// COMPLETED MISSIONS — the quiet archive
// ---------------------------------------------------------------------------

function furnishArchive(ctx: PropCtx, roomId: string) {
  const cx = -46
  const cz = -124
  anchor(ctx, 'archive:stand', roomId, 'archive', cx, cz + 6.5, [0, -1])

  // eight empty plaque pedestals; finished projects fill them in
  for (let i = 0; i < 8; i++) {
    const row = i < 4 ? -1 : 1
    const ang = Math.PI / 2 + row * (0.5 + (i % 4) * 0.33)
    const px = cx + Math.sin(ang) * 8.6
    const pz = cz + Math.cos(ang) * 8.6
    const rot = ang + Math.PI
    ctx.batch.at(rbox(3.0, 1.5, 1.2, 0.12), M.hull, px, 0.75, pz, rot)
    ctx.batch.at(rbox(2.6, 0.18, 0.9, 0.06), M.hullSoft, px, 1.58, pz, rot)
    ctx.batch.at(box(2.2, 0.06, 0.1), M.glow(ACCENT.gold, 0.7), px, 1.4, pz, rot)
    solidCircle(ctx, px, pz, 1.5)
    anchor(ctx, `plaque:${i}`, roomId, 'plaque', px, pz, [Math.sin(rot), Math.cos(rot)])
  }

  ctx.batch.at(cyl(3.4, 3.8, 0.5, 32), M.hull, cx, 0.25, cz)
  ctx.batch.at(cyl(3.4, 3.4, 0.08, 32), M.glow(ACCENT.gold, 1.0), cx, 0.52, cz)
  solidCircle(ctx, cx, cz, 4.0)
  const holo = new THREE.Group()
  holo.position.set(cx, 2.8, cz)
  const star = new THREE.Mesh(tube(1.7, 0.08, 32), M.holo(ACCENT.gold, 0.7))
  star.rotation.x = Math.PI / 2
  const arc = new THREE.Mesh(tube(1.2, 0.06, 28), M.holo(ACCENT.gold, 0.5))
  arc.rotation.y = 0.9
  arc.rotation.x = Math.PI / 2
  holo.add(star, arc)
  holo.userData.star = star
  ctx.register('holo:archive', holo)
  Planter(ctx, cx + 8.5, cz - 6)
  Planter(ctx, cx - 8.5, cz + 6)
}

// ---------------------------------------------------------------------------
// ROBOT DOCK — where worker agents are built and launched
// ---------------------------------------------------------------------------

function furnishDock(ctx: PropCtx, roomId: string) {
  const cz = 150
  for (const x of [-20, 20]) {
    ctx.batch.at(box(0.6, 0.6, 26), M.dark, x, 7.2, cz)
    for (const z of [-12, 0, 12]) ctx.batch.at(box(0.4, 1.4, 0.4), M.steel, x, 6.4, cz + z)
  }
  ctx.batch.at(box(40, 0.4, 0.8), M.dark, 0, 7.1, cz)

  let n = 0
  for (const z of [140, 150, 160]) {
    for (const s of [-1, 1]) {
      DockingStation(ctx, `dock${n++}`, roomId, s * 20, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, 'cyan', 'dock')
      ChargingStation(ctx, s * 25, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, 'cyan', `dk${n}`)
    }
  }

  ctx.batch.at(cyl(4.6, 5.0, 0.4, 32), M.hullSoft, 0, 0.2, cz)
  ctx.batch.at(cyl(4.4, 4.4, 0.1, 32), M.floorPanel, 0, 0.42, cz)
  ctx.batch.at(cyl(4.7, 4.7, 0.06, 32), M.glow(C.cyan, 1.1), 0, 0.4, cz)
  solidCircle(ctx, 0, cz, 5.2)
  RoboticArm(ctx, 0, cz - 2.4, 0.6, 'cyan')

  StorageContainer(ctx, -13, 138, 0.2, 2.6)
  StorageContainer(ctx, -13, 141.5, 0.2, 2.4)
  StorageContainer(ctx, 13, 138, -0.2, 2.6)
  StorageContainer(ctx, 13, 141.5, -0.2, 2.4)
  SpareRobotParts(ctx, -13, 161, 0.4)
  SpareRobotParts(ctx, 13, 161, -0.4)
  MechanicalPanel(ctx, 'mech:dock:a', -27.4, cz, Math.PI / 2, 'cyan')
  MechanicalPanel(ctx, 'mech:dock:b', 27.4, cz, -Math.PI / 2, 'cyan')
  CommunicationTerminal(ctx, -22, 134.5, 0)
  CommunicationTerminal(ctx, 22, 134.5, 0)
  StatusPylon(ctx, 'pylon:dock', 0, 137.2, 'cyan')
  Plant(ctx, -25, 144, 1.4)
  Plant(ctx, 25, 144, 1.4)
  anchor(ctx, 'dock:pad', roomId, 'dock-pad', 0, cz + 7, [0, -1])
}

// ---------------------------------------------------------------------------
// WORKSHOP — build, maintain, improve
// ---------------------------------------------------------------------------

function furnishWorkshop(ctx: PropCtx, roomId: string) {
  const cx = 24
  const cz = 78
  MaintenanceBerth(ctx, cx - 9, cz - 7.5, 0, 'cyan')
  MaintenanceBerth(ctx, cx + 2, cz - 7.5, 0, 'cyan')
  RoboticArm(ctx, cx + 10.5, cz - 6.5, -0.9, 'cyan')
  RoboticArm(ctx, cx - 10.5, cz + 4.5, 2.4, 'cyan')
  Workbench(ctx, cx - 8, cz + 8, 0)
  Workbench(ctx, cx + 8, cz + 8, Math.PI)
  Workbench(ctx, cx + 13.5, cz - 1, -Math.PI / 2)
  StorageContainer(ctx, cx - 13, cz - 7, 0.3, 2.8)
  StorageContainer(ctx, cx - 13, cz - 3.5, 0.3, 2.4)
  StorageContainer(ctx, cx + 14, cz + 9.5, -0.3, 2.6)
  SpareRobotParts(ctx, cx - 4.5, cz + 1, 0.8)
  SpareRobotParts(ctx, cx + 5.5, cz - 2, -0.6)

  for (let i = 0; i < 6; i++) {
    const px = cx - 10 + i * 4
    ctx.batch.at(rbox(3.2, 1.1, 1.0, 0.1), M.hullSoft, px, 1.4, cz - 12)
    ctx.batch.at(box(3.0, 0.1, 1.1), M.dark, px, 2.0, cz - 12)
    ctx.batch.at(box(0.6, 0.06, 0.08), M.glow(ACCENT.cyan, 0.9), px, 1.85, cz - 11.4)
  }
  solidBox(ctx, cx, cz - 12, 26, 1.6)
  MechanicalPanel(ctx, 'mech:shop:a', cx - 16.4, cz - 4, Math.PI / 2, 'cyan')
  MechanicalPanel(ctx, 'mech:shop:b', cx + 16.4, cz + 2, -Math.PI / 2, 'cyan')
  MissionDisplay(ctx, 'screen:shop', cx, cz + 12.4, Math.PI, 'cyan', 9, 3.2)
  ChargingStation(ctx, cx - 13.5, cz + 8, -Math.PI / 2, 'cyan', 'shop')
  ChargingStation(ctx, cx + 13.5, cz + 4, Math.PI / 2, 'cyan', 'shop2')

  anchor(ctx, 'shop:0', roomId, 'workstation', cx - 9, cz - 4.4, [0, 1])
  anchor(ctx, 'shop:1', roomId, 'workstation', cx + 2, cz - 4.4, [0, 1])
  anchor(ctx, 'shop:observe', roomId, 'view', cx, cz + 6.5, [0, 1])
  Plant(ctx, cx + 15, cz - 11, 1.4)
  Plant(ctx, cx - 15, cz + 11, 1.3)
  StatusPylon(ctx, 'pylon:shop', cx, cz - 10.6, 'cyan')
}

// ---------------------------------------------------------------------------
// AGENT LABS — one specialist room per role
// ---------------------------------------------------------------------------

function furnishLab(
  ctx: PropCtx,
  roomId: string,
  role: AgentRole,
  accent: AccentName,
  center: [number, number],
) {
  const [cx, cz] = center
  const color = ACCENT[accent]
  const icon = ROLE_ICON[role]

  const crest = new THREE.Mesh(
    plane(3.6, 3.6),
    new THREE.MeshBasicMaterial({ map: roleIconTextureCached(icon, color), transparent: true }),
  )
  crest.position.set(cx, 4.8, cz - 12.3)
  ctx.register(`crest:${roomId}`, crest)
  ctx.batch.at(cyl(2.1, 2.1, 0.16, 32), M.dark, cx, 4.8, cz - 12.5, 0, Math.PI / 2)
  ctx.batch.at(tube(2.0, 0.07, 32), M.glow(color, 1.2), cx, 4.8, cz - 12.5)

  const homeSpots: [number, number][] = [
    [cx - 9, cz + 7],
    [cx, cz + 7.5],
    [cx + 9, cz + 7],
  ]
  homeSpots.forEach(([px, pz], i) => {
    DockingStation(ctx, `home:${roomId}:${i}`, roomId, px, pz, 0, accent, 'home')
    if (i !== 1) ChargingStation(ctx, px + (i === 0 ? -3.4 : 3.4), pz, 0, accent, `${roomId}${i}`)
  })
  ChargingStation(ctx, cx - 15, cz - 2, Math.PI / 2, accent, `${roomId}extra`)

  MissionDisplay(ctx, `screen:${roomId}:main`, cx, cz - 12.3, 0, accent, 12, 4.0)

  if (role === 'backend') {
    for (let i = 0; i < 4; i++) ServerCabinet(ctx, cx - 12 + i * 8.4, cz - 8.4, 0, accent)
    Workbench(ctx, cx - 9, cz - 2, 0)
    Workbench(ctx, cx + 9, cz - 2, 0)
    const api = HoloBoard(ctx, `holo:${roomId}:api`, cx + 12.8, 4.4, cz + 2.5, -1.4, accent, 5.6, 4.0)
    api.userData.kind = 'api'
    ComputerTerminal(ctx, cx + 13, cz - 3.5, -Math.PI / 2, accent, 'pillar')
    for (let i = 0; i < 5; i++) {
      ctx.batch.at(cyl(0.09, 0.09, 4 + i, 8), M.rubber, cx - 13 + i * 1.1, 0.12, cz + 3.4, 0, Math.PI / 2, Math.PI / 2)
    }
    anchor(ctx, `lab:${roomId}:0`, roomId, 'station', cx - 9, cz + 2, [0, -1])
    anchor(ctx, `lab:${roomId}:1`, roomId, 'station', cx + 9, cz + 2, [0, -1])
  } else if (role === 'frontend') {
    InterfaceHologram(ctx, `holo:${roomId}:ui`, cx - 9, 4.2, cz - 2, 0.9, accent)
    InterfaceHologram(ctx, `holo:${roomId}:ui2`, cx + 9, 4.6, cz - 3.5, -1.1, accent)
    Workbench(ctx, cx - 9, cz + 1.5, 0)
    Workbench(ctx, cx + 9, cz + 1.5, 0)
    ComputerTerminal(ctx, cx - 9, cz - 4.5, 0, accent, 'pillar')
    ComputerTerminal(ctx, cx + 9, cz - 4.5, 0, accent, 'pillar')
    for (let i = 0; i < 3; i++) {
      ctx.batch.at(rbox(5.4, 1.0, 1.2, 0.12), M.hullSoft, cx - 8 + i * 8, 1.3, cz - 10.5)
      ctx.batch.at(box(5.0, 0.08, 0.12), M.glow(color, 0.9), cx - 8 + i * 8, 1.85, cz - 9.9)
    }
    solidBox(ctx, cx, cz - 10.5, 26, 1.6)
    anchor(ctx, `lab:${roomId}:0`, roomId, 'station', cx - 9, cz + 3.4, [0, -1])
    anchor(ctx, `lab:${roomId}:1`, roomId, 'station', cx + 9, cz + 3.4, [0, -1])
  } else if (role === 'review') {
    ReviewBoard(ctx, `board:${roomId}`, cx, cz - 12.3, 0, accent)
    ctx.batch.at(rbox(7.0, 0.26, 2.6, 0.12), M.hullSoft, cx, 1.5, cz - 2.5)
    ctx.batch.at(box(6.6, 0.9, 2.2), M.hull, cx, 1.0, cz - 2.5)
    solidBox(ctx, cx, cz - 2.5, 7.4, 3.0)
    ctx.batch.at(tube(1.2, 0.08, 28), M.glow(color, 1.3), cx, 2.6, cz - 2.5, 0, Math.PI / 2)
    for (let i = 0; i < 3; i++) {
      const px = cx - 8 + i * 8
      ctx.batch.at(rbox(2.4, 2.2, 0.6, 0.1), M.hullSoft, px, 1.4, cz - 11.4)
      for (let j = 0; j < 5; j++) {
        ctx.batch.at(box(1.9, 0.05, 0.1), M.glow(color, 0.5), px, 0.6 + j * 0.35, cz - 11.05)
      }
    }
    solidBox(ctx, cx, cz - 11.4, 26, 1.2)
    ComputerTerminal(ctx, cx - 10, cz + 2.5, 0.4, accent, 'desk')
    ComputerTerminal(ctx, cx + 10, cz + 2.5, -0.4, accent, 'desk')
    anchor(ctx, `lab:${roomId}:0`, roomId, 'station', cx, cz + 1.2, [0, -1])
    anchor(ctx, `lab:${roomId}:1`, roomId, 'station', cx - 10, cz + 5.5, [0, -1])
  } else {
    SimulationChamber(ctx, `chamber:${roomId}:a`, cx - 9, cz - 4, 0, accent)
    SimulationChamber(ctx, `chamber:${roomId}:b`, cx + 9, cz - 4, 0, accent)
    ctx.batch.at(rbox(9.0, 0.3, 1.6, 0.14), M.hullSoft, cx, 1.6, cz + 5.5)
    ctx.batch.at(box(8.6, 1.1, 1.3), M.hull, cx, 1.0, cz + 5.5)
    ctx.batch.at(box(8.0, 0.1, 0.14), M.glow(color, 1.1), cx, 1.45, cz + 6.15)
    solidBox(ctx, cx, cz + 5.5, 9.4, 1.9)
    for (let i = 0; i < 4; i++) {
      const px = cx - 11 + i * 7.4
      ctx.batch.at(rbox(2.6, 3.4, 0.5, 0.1), M.dark, px, 1.9, cz - 11.6)
      ctx.batch.at(box(2.2, 2.8, 0.1), M.glow(i % 2 ? C.red : C.cyan, 0.7), px, 1.9, cz - 11.3)
    }
    solidBox(ctx, cx, cz - 11.6, 30, 1.4)
    anchor(ctx, `lab:${roomId}:0`, roomId, 'station', cx, cz + 8.2, [0, -1])
    anchor(ctx, `lab:${roomId}:1`, roomId, 'station', cx - 11, cz + 1, [1, 0])
  }

  Plant(ctx, cx + 15, cz - 10, 1.5)
  Plant(ctx, cx - 15, cz + 10, 1.2)
  StatusPylon(ctx, `pylon:${roomId}`, cx - 15.4, cz - 9.5, accent)
  anchor(ctx, `view:${roomId}`, roomId, 'view', cx, cz + 10.5, [0, -1])
}

// ---------------------------------------------------------------------------
// PROJECT MODULES — a physical room per project
// ---------------------------------------------------------------------------

export function furnishProjectModule(
  ctx: PropCtx,
  roomId: string,
  center: [number, number],
  doorSide: 'E' | 'W',
  accent: AccentName,
) {
  const [cx, cz] = center
  const color = ACCENT[accent]
  const facing = doorSide === 'E' ? 1 : -1

  const board = HoloBoard(ctx, `holo:${roomId}`, cx, 4.7, cz - 12.2, 0, accent, 9.4, 5.0)
  board.userData.kind = 'project'
  ctx.batch.at(rbox(9.8, 0.5, 0.5, 0.1), M.dark, cx, 7.4, cz - 12.2)
  ctx.batch.at(box(9.0, 0.12, 0.16), M.glow(color, 1.3), cx, 7.1, cz - 12.2)
  solidBox(ctx, cx, cz - 12.2, 10, 1.2)

  MissionDisplay(ctx, `screen:${roomId}:tasks`, cx - 14.5, cz - 12.3, 0, accent, 5.5, 3.2)

  const stations: [number, number][] = [
    [cx - 9, cz - 4],
    [cx + 9, cz - 4],
    [cx - 9, cz + 5],
    [cx + 9, cz + 5],
  ]
  stations.forEach(([px, pz], i) => {
    ComputerTerminal(ctx, px, pz, px < cx ? 0.5 : -0.5, accent, 'pillar')
    // the robot stands in front of the terminal and faces it
    anchor(ctx, `work:${roomId}:${i}`, roomId, 'workstation', px, pz + 2.9, [0, -1])
  })

  DockingStation(ctx, `pdock:${roomId}:0`, roomId, cx + facing * 12, cz + 8.5, 0, accent, 'park')
  DockingStation(ctx, `pdock:${roomId}:1`, roomId, cx + facing * 5, cz + 9.5, 0, accent, 'park')

  Workbench(ctx, cx - facing * 12.5, cz + 2, facing * Math.PI * 0.5)
  StorageContainer(ctx, cx - facing * 15.4, cz - 8, facing * 0.4, 2.4)
  StorageContainer(ctx, cx - facing * 15.4, cz - 4.6, facing * 0.4, 2.0)
  HolographicProjector(ctx, cx + facing * 2, cz + 2, accent, 1.2)
  for (let i = 0; i < 4; i++) {
    ctx.batch.at(
      cyl(0.08, 0.08, 3.4 + i, 8),
      M.rubber,
      cx + facing * (13 - i * 0.6),
      0.12,
      cz - 9 + i * 1.2,
      0,
      Math.PI / 2,
      Math.PI / 2,
    )
  }
  MechanicalPanel(ctx, `mech:${roomId}`, cx + facing * 16.4, cz - 7, -facing * Math.PI * 0.5, accent)
  Plant(ctx, cx - facing * 14.5, cz + 10.5, 1.3)
  StatusPylon(ctx, `pylon:${roomId}`, cx - facing * 15, cz + 10.2, accent)
}

/** A dormant module: scaffolding, crates, no power. */
export function furnishExpansionBay(
  ctx: PropCtx,
  roomId: string,
  center: [number, number],
  doorSide: 'E' | 'W',
) {
  const [cx, cz] = center
  const facing = doorSide === 'E' ? 1 : -1
  for (let i = 0; i < 5; i++) {
    const px = cx + facing * (-12 + i * 6)
    ctx.batch.at(box(0.3, 6.4, 0.3), M.steel, px, 3.2, cz - 11)
    ctx.batch.at(box(0.3, 6.4, 0.3), M.steel, px, 3.2, cz + 11)
  }
  ctx.batch.at(box(30, 0.3, 0.3), M.steel, cx, 6.4, cz - 11)
  ctx.batch.at(box(30, 0.3, 0.3), M.steel, cx, 6.4, cz + 11)
  StorageContainer(ctx, cx - facing * 13, cz - 6, 0.3, 2.6)
  StorageContainer(ctx, cx - facing * 13, cz + 2, 0.3, 2.2)
  StorageContainer(ctx, cx + facing * 12, cz + 7, -0.3, 2.4)
  ctx.batch.at(rbox(9, 0.4, 5, 0.2), M.hullDeep, cx, 0.2, cz)
  ctx.batch.at(tube(3.4, 0.06, 32), M.glow(C.cyanDeep, 0.5), cx, 0.42, cz, 0, Math.PI / 2)
  solidBox(ctx, cx, cz, 9, 5)
  StatusPylon(ctx, `pylon:${roomId}`, cx, cz + 11.6, 'cyan')
}

export {
  furnishCommand,
  furnishHQ,
  furnishMission,
  furnishArchive,
  furnishDock,
  furnishWorkshop,
  furnishLab,
}
