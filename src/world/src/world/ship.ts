import * as THREE from 'three'
import { ACCENT, C, M, type AccentName } from '../core/palette'
import { starfieldTexture, planetTexture } from '../core/textures'
import { damp, makeRng } from '../core/math'
import {
  ARCHIVE_CENTER,
  ARCHIVE_RADIUS,
  COMMAND_CENTER,
  COMMAND_RADIUS,
  DOCK_CENTER,
  DOCK_DEPTH,
  HQ_CENTER,
  HQ_RADIUS,
  MISSION_CENTER,
  MISSION_RADIUS,
  ROOMS,
  SPINE_HALF,
  SPINE_SEGMENTS,
  bandZ,
  type RoomDef,
} from './layout'
import { makeCtx, box, cyl, rbox, sph, tube, type PropCtx } from './props'
import {
  furnishArchive,
  furnishCommand,
  furnishDock,
  furnishExpansionBay,
  furnishHQ,
  furnishLab,
  furnishMission,
  furnishProjectModule,
  furnishWorkshop,
  makeSign,
} from './interiors'
import {
  attachAnchors,
  buildNav,
  buildWalkable,
  type NavGraph,
  type Obstacle,
  type Walkable,
} from './nav'

/** Per-room runtime: everything that changes when a room comes alive. */
export interface RoomRuntime {
  id: string
  def: RoomDef
  accent: number
  power: number
  target: number
  lights: THREE.PointLight[]
  strips: THREE.MeshStandardMaterial[]
  holo: THREE.Object3D[]
  signMats: THREE.MeshBasicMaterial[]
  signs: THREE.Object3D[]
  active: boolean
}

export interface DoorRuntime {
  group: THREE.Group
  left: THREE.Object3D
  right: THREE.Object3D
  baseLeft: THREE.Vector3
  baseRight: THREE.Vector3
  x: number
  z: number
  axis: 'x' | 'z'
  width: number
  open: number
  target: number
}

export interface Ship {
  root: THREE.Group
  ctx: PropCtx
  nav: NavGraph
  walkable: Walkable
  obstacles: Obstacle[]
  rooms: Map<string, RoomRuntime>
  doors: DoorRuntime[]
  space: THREE.Group
  setRoomPower(id: string, on: boolean): void
  setSign(roomId: string, title: string, subtitle: string, accent: number): void
  update(dt: number, visitors: { x: number; z: number; r: number }[]): void
}

const DOOR_TOP = 5.4
const SPINE_H = 7.0
const WALL_T = 0.8

// ---------------------------------------------------------------------------
// Wall construction
// ---------------------------------------------------------------------------

interface Gap {
  at: number
  width: number
  top?: number
}

interface WallOpts {
  accent?: AccentName
  ribs?: boolean
  inward?: 1 | -1
}

/**
 * A wall run with openings. `axis` is the direction the wall travels:
 * 'z' walls sit at a fixed X, 'x' walls sit at a fixed Z. Each opening gets a
 * lintel above it so the wall stays a wall, and the run is dec'd out with
 * panels, rails and an accent light line.
 */
function wallRun(
  ctx: PropCtx,
  mat: THREE.Material,
  axis: 'x' | 'z',
  fixed: number,
  from: number,
  to: number,
  h: number,
  t: number,
  gaps: Gap[] = [],
  opt: WallOpts = {},
) {
  const inward: 1 | -1 = opt.inward ?? (fixed > 0 ? -1 : 1)
  const sorted = [...gaps].sort((a, b) => a.at - b.at)
  let cursor = from
  for (const g of sorted) {
    const gs = Math.max(from, g.at - g.width / 2)
    const ge = Math.min(to, g.at + g.width / 2)
    if (gs - cursor > 0.15) slab(cursor, gs, 0, h)
    const top = g.top ?? DOOR_TOP
    if (top < h - 0.05) slab(gs - 0.25, ge + 0.25, top, h)
    cursor = Math.max(cursor, ge)
  }
  if (to - cursor > 0.15) slab(cursor, to, 0, h)

  function slab(a0: number, a1: number, y0: number, y1: number) {
    const len = a1 - a0
    const hh = y1 - y0
    if (len <= 0.15 || hh <= 0.05) return
    const mid = (a0 + a1) / 2
    const cx = axis === 'z' ? fixed : mid
    const cz = axis === 'z' ? mid : fixed
    const ry = axis === 'z' ? 0 : Math.PI / 2
    const cy = y0 + hh / 2

    ctx.batch.at(rbox(axis === 'z' ? t : len, hh, axis === 'z' ? len : t, 0.05), mat, cx, cy, cz, ry)
    // kick plate + top rail
    ctx.batch.at(
      rbox(axis === 'z' ? t + 0.1 : len, 0.55, axis === 'z' ? len : t + 0.1, 0.05),
      M.darker,
      cx,
      Math.max(0.28, y0 + 0.28),
      cz,
      ry,
    )
    ctx.batch.at(
      rbox(axis === 'z' ? t + 0.18 : len, 0.26, axis === 'z' ? len : t + 0.18, 0.05),
      M.dark,
      cx,
      y1 - 0.13,
      cz,
      ry,
    )

    if (hh > 2.2 && opt.ribs !== false) {
      const panels = Math.max(1, Math.round(len / 4.4))
      const step = len / panels
      for (let i = 0; i < panels; i++) {
        const off = a0 + step * (i + 0.5)
        const px = axis === 'z' ? fixed : off
        const pz = axis === 'z' ? off : fixed
        const w = Math.min(step * 0.72, 3.1)
        const inner = t / 2 + 0.04
        const dx = axis === 'z' ? inward * inner : 0
        const dz = axis === 'z' ? 0 : inward * inner
        ctx.batch.at(
          rbox(axis === 'z' ? 0.07 : w, Math.min(2.6, hh - 1.3), axis === 'z' ? w : 0.07, 0.03),
          M.hullDeep,
          px + dx,
          cy,
          pz + dz,
          ry,
        )
        ctx.batch.at(
          rbox(axis === 'z' ? 0.2 : 0.18, hh - 0.7, axis === 'z' ? 0.18 : 0.2, 0.04),
          M.dark,
          px + dx * 1.6,
          cy,
          pz + dz * 1.6,
          ry,
        )
      }
    }
    if (opt.accent && opt.accent !== 'none' && y0 < 1.4 && y1 > 1.4) {
      const color = ACCENT[opt.accent]
      const inner = t / 2 + 0.06
      const dx = axis === 'z' ? inward * inner : 0
      const dz = axis === 'z' ? 0 : inward * inner
      ctx.batch.at(
        rbox(axis === 'z' ? 0.08 : len * 0.96, 0.1, axis === 'z' ? len * 0.96 : 0.08, 0.02),
        M.glow(color, 1.1),
        (axis === 'z' ? fixed : mid) + dx,
        1.1,
        (axis === 'z' ? mid : fixed) + dz,
        ry,
      )
    }
  }
}

function roundPlate(ctx: PropCtx, mat: THREE.Material, x: number, y: number, z: number, r: number, up: boolean) {
  ctx.batch.at(new THREE.CircleGeometry(r, 56), mat, x, y, z, 0, up ? -Math.PI / 2 : Math.PI / 2)
}

function shellArc(
  ctx: PropCtx,
  mat: THREE.Material,
  x: number,
  z: number,
  radius: number,
  y0: number,
  y1: number,
  thetaStart: number,
  thetaLength: number,
) {
  if (thetaLength <= 0.01 || y1 - y0 <= 0.02) return
  const h = y1 - y0
  const geo = new THREE.CylinderGeometry(
    radius,
    radius,
    h,
    Math.max(6, Math.round(thetaLength * 20)),
    1,
    true,
    thetaStart,
    thetaLength,
  )
  ctx.batch.at(geo, mat, x, y0 + h / 2, z)
}

function ringWall(
  ctx: PropCtx,
  mat: THREE.Material,
  x: number,
  z: number,
  radius: number,
  y0: number,
  y1: number,
  gaps: { a: number; half: number }[],
) {
  const norm = gaps
    .map((g) => ({ a: norm2pi(g.a), half: g.half }))
    .sort((p, q) => p.a - q.a)

  // A gap centred on 0 (or wrapping past it) splits the ring in two, so the
  // first arc starts after it and the last arc runs up to where it begins.
  let start = 0
  const queue = [...norm]
  const wrapped = queue.find((g) => g.a - g.half < 0)
  if (wrapped) {
    start = wrapped.a + wrapped.half
    queue.splice(queue.indexOf(wrapped), 1)
  }
  for (const g of queue) {
    const gs = g.a - g.half
    if (gs > start) shellArc(ctx, mat, x, z, radius, y0, y1, start, gs - start)
    start = Math.max(start, g.a + g.half)
  }
  const end = wrapped ? Math.PI * 2 + (wrapped.a - wrapped.half) : Math.PI * 2
  if (end > start + 0.01) shellArc(ctx, mat, x, z, radius, y0, y1, start, end - start)
}

const norm2pi = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)

// ---------------------------------------------------------------------------
// Exterior
// ---------------------------------------------------------------------------

function buildSpace() {
  const group = new THREE.Group()
  group.name = 'space'

  const sky = new THREE.MeshBasicMaterial({ map: starfieldTexture(), side: THREE.BackSide, fog: false })
  group.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 40, 24), sky))

  const earth = new THREE.MeshBasicMaterial({ map: planetTexture(true), fog: false })
  const planet = new THREE.Mesh(new THREE.SphereGeometry(430, 48, 32), earth)
  planet.position.set(340, -180, 1500)
  planet.rotation.z = 0.4
  group.add(planet)

  const rock = new THREE.MeshBasicMaterial({ map: planetTexture(false), fog: false })
  const moon = new THREE.Mesh(new THREE.SphereGeometry(150, 36, 24), rock)
  moon.position.set(-780, 300, 1150)
  group.add(moon)

  const asteroidMat = new THREE.MeshStandardMaterial({
    color: 0x76736d,
    roughness: 0.95,
    metalness: 0.05,
    flatShading: true,
    fog: false,
  })
  const rng = makeRng(4242)
  for (let i = 0; i < 22; i++) {
    const s = 6 + rng() * 30
    const a = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), asteroidMat)
    a.position.set(-460 + rng() * 920, -300 + rng() * 560, 560 + rng() * 1250)
    a.rotation.set(rng() * 3, rng() * 3, rng() * 3)
    a.userData.spin = (rng() - 0.5) * 0.1
    group.add(a)
  }
  return group
}

function porthole(ctx: PropCtx, x: number, y: number, z: number, ry: number, r: number) {
  ctx.batch.at(tube(r, 0.26, 28), M.dark, x, y, z, ry)
  ctx.batch.at(cyl(r - 0.12, r - 0.12, 0.07, 28), M.glass, x, y, z, ry, Math.PI / 2)
  ctx.batch.at(cyl(r - 0.12, r - 0.12, 0.05, 28), M.glow(C.cyan, 0.45), x, y, z, ry, Math.PI / 2)
  ctx.batch.at(tube(r * 0.82, 0.08, 24), M.steel, x, y, z, ry)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const tx = x + Math.cos(ry) * Math.cos(a) * r * 0.92
    const tz = z - Math.sin(ry) * Math.cos(a) * r * 0.92
    ctx.batch.at(box(0.14, 0.14, 0.14), M.steel, tx, y + Math.sin(a) * r * 0.92, tz, ry)
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildShip(): Ship {
  const ctx = makeCtx()
  const root = new THREE.Group()
  root.name = 'ship'
  const rooms = new Map<string, RoomRuntime>()
  const doors: DoorRuntime[] = []

  root.add(buildSpace())

  // --- spine ---------------------------------------------------------------
  const bands = [0, 1, 2, 3, 4].map(bandZ)
  for (const seg of SPINE_SEGMENTS) {
    const len = seg.z1 - seg.z0
    if (len < 1) continue
    const mid = (seg.z0 + seg.z1) / 2
    const gaps: Gap[] = bands
      .filter((z) => z > seg.z0 + 1.5 && z < seg.z1 - 1.5)
      .map((z) => ({ at: z, width: 8.2, top: DOOR_TOP }))
    wallRun(ctx, M.hull, 'z', -4.4, seg.z0, seg.z1, SPINE_H, WALL_T, gaps, {
      accent: 'cyan',
      inward: 1,
    })
    wallRun(ctx, M.hull, 'z', 4.4, seg.z0, seg.z1, SPINE_H, WALL_T, gaps, {
      accent: 'cyan',
      inward: -1,
    })
    ctx.batch.at(rbox(9.8, 0.5, len, 0.05), M.floor, 0, -0.25, mid)
    const n = Math.max(1, Math.round(len / 6))
    for (let i = 0; i < n; i++) {
      ctx.batch.at(box(9.0, 0.06, (len / n) * 0.93), M.floorPanel, 0, 0.02, seg.z0 + (len / n) * (i + 0.5))
    }
    ctx.batch.at(box(0.16, 0.05, len * 0.98), M.glow(C.cyan, 0.7), -3.7, 0.07, mid)
    ctx.batch.at(box(0.16, 0.05, len * 0.98), M.glow(C.cyan, 0.7), 3.7, 0.07, mid)
    ctx.batch.at(rbox(9.8, 0.5, len, 0.05), M.hull, 0, SPINE_H + 0.25, mid)
    const ribs = Math.max(2, Math.round(len / 6))
    for (let i = 0; i < ribs; i++) {
      const rmid = seg.z0 + (len / ribs) * (i + 0.5)
      ctx.batch.at(rbox(9.4, 0.4, 0.5, 0.06), M.hullDeep, 0, SPINE_H - 0.2, rmid)
      ctx.batch.at(box(3.6, 0.12, 0.5), M.lampWarm, 0, SPINE_H - 0.44, rmid)
    }
  }

  // --- door tunnels --------------------------------------------------------
  const tunnelSides: { room: RoomDef; side: 1 | -1 }[] = []
  for (const room of ROOMS) {
    if (room.kind === 'command' || room.kind === 'hq' || room.kind === 'dock') continue
    if (room.id === 'mission' || room.id === 'archive') continue
    const side: 1 | -1 = room.doors[0].side === 'E' ? -1 : 1
    tunnelSides.push({ room, side })
    buildTunnel(ctx, room, side)
  }

  // --- room shells ---------------------------------------------------------
  for (const room of ROOMS) {
    if (room.shape === 'round') continue
    if (room.kind === 'dock') buildDockShell(ctx, room)
    else buildRectShell(ctx, room)
  }
  buildCommandShell(ctx)
  buildRotunda(ctx, 'hq', 0, HQ_CENTER, HQ_RADIUS)
  buildRotunda(ctx, 'mission', 0, MISSION_CENTER, MISSION_RADIUS)
  buildRotunda(ctx, 'archive', ARCHIVE_CENTER[0], ARCHIVE_CENTER[1], ARCHIVE_RADIUS)
  buildArchiveHall(ctx)

  // --- interiors -----------------------------------------------------------
  furnishCommand(ctx, 'command')
  furnishHQ(ctx, 'hq')
  furnishMission(ctx, 'mission')
  furnishArchive(ctx, 'archive')
  furnishDock(ctx, 'dock')
  furnishWorkshop(ctx, 'workshop')
  for (const room of ROOMS) {
    if (room.kind === 'agent' && room.role) furnishLab(ctx, room.id, room.role, room.accent, room.center)
  }
  for (const room of ROOMS.filter((r) => r.kind === 'project')) {
    furnishProjectModule(ctx, room.id, room.center, room.doors[0].side === 'E' ? 'E' : 'W', room.accent)
  }
  for (const room of ROOMS.filter((r) => r.kind === 'expansion')) {
    furnishExpansionBay(ctx, room.id, room.center, room.doors[0].side === 'E' ? 'E' : 'W')
  }

  // --- room runtime rigs ---------------------------------------------------
  for (const room of ROOMS) {
    const rt = ensureRoom(rooms, room)
    const color = ACCENT[room.accent]
    const isRound = room.shape === 'round'
    const h = room.height

    const stripMat = new THREE.MeshStandardMaterial({
      color: 0x2b2f33,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0,
      roughness: 0.4,
    })
    rt.strips.push(stripMat)
    const stripGroup = new THREE.Group()
    stripGroup.name = `power:${room.id}`
    const count = isRound ? 3 : 2
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * (isRound ? 8 : 8.5)
      const len = isRound ? 15 : room.size[0] * 0.58
      const mesh = new THREE.Mesh(box(len, 0.18, 0.55), stripMat)
      if (isRound) mesh.position.set(off, h - 0.55, room.center[1])
      else mesh.position.set(room.center[0], h - 0.5, room.center[1] + off)
      stripGroup.add(mesh)
    }
    ctx.register(stripGroup.name, stripGroup)

    const light = new THREE.PointLight(color, 0, isRound ? 56 : 44, 1.7)
    light.position.set(room.center[0], isRound ? h * 0.6 : h - 1.4, room.center[1])
    ctx.lights.add(light)
    rt.lights.push(light)
    if (!isRound) {
      const warm = new THREE.PointLight(0xfff0da, 0, 34, 1.6)
      warm.position.set(room.center[0], h - 1.0, room.center[1])
      warm.userData.warm = true
      ctx.lights.add(warm)
      rt.lights.push(warm)
    }
  }

  // --- signage over every doorway -----------------------------------------
  for (const { room, side } of tunnelSides) {
    if (!room.sign) continue
    const rt = ensureRoom(rooms, room)
    const sign = makeSign(
      ctx,
      `sign:${room.id}`,
      side * 3.95,
      6.15,
      room.center[1],
      side > 0 ? Math.PI / 2 : -Math.PI / 2,
      room.sign[0],
      room.sign[1],
      ACCENT[room.accent],
    )
    rt.signs.push(sign)
    rt.signMats.push((sign.userData.face as THREE.Mesh).material as THREE.MeshBasicMaterial)
  }

  // --- doors ---------------------------------------------------------------
  for (const { room, side } of tunnelSides) {
    const d = room.doors[0]
    if (!d.auto) continue
    doors.push(buildDoor(ctx, `door:${room.id}`, side * 5.5, room.center[1], 'z', d.width, room.accent))
  }
  doors.push(buildDoor(ctx, 'door:mission', -19, MISSION_CENTER, 'z', 7, 'cyan'))
  doors.push(buildDoor(ctx, 'door:archive', -32.6, MISSION_CENTER, 'z', 7, 'gold'))

  // --- link holograms to their rooms --------------------------------------
  for (const rt of rooms.values()) {
    for (const [name, obj] of ctx.registry) {
      if (!name.startsWith('holo:')) continue
      if (name === 'holo:archive' && rt.id === 'archive') rt.holo.push(obj)
      else if (name.startsWith(`holo:${rt.id}`)) rt.holo.push(obj)
      else if (rt.id === 'command' && name.startsWith('holo:dev')) rt.holo.push(obj)
    }
  }

  // --- assemble ------------------------------------------------------------
  const staticGroup = ctx.batch.build('ship-static')
  for (const m of staticGroup.children) {
    m.castShadow = false
    m.receiveShadow = true
  }
  root.add(staticGroup, ctx.dynamic, ctx.lights)

  const nav = buildNav()
  attachAnchors(nav, ctx.anchors)

  const ship: Ship = {
    root,
    ctx,
    nav,
    walkable: buildWalkable(),
    obstacles: ctx.obstacles,
    rooms,
    doors,
    space: root.getObjectByName('space') as THREE.Group,
    setRoomPower(id, on) {
      const rt = rooms.get(id)
      if (!rt) return
      rt.active = on
      rt.target = on ? 1 : 0.1
    },
    setSign(roomId, title, subtitle, accent) {
      const rt = rooms.get(roomId)
      if (!rt) return
      for (const s of rt.signs) {
        ;(s.userData.label as ((t: string, sub: string, a: number) => void) | undefined)?.(
          title,
          subtitle,
          accent,
        )
      }
      rt.signMats = rt.signs.map(
        (s) => (s.userData.face as THREE.Mesh).material as THREE.MeshBasicMaterial,
      )
      rt.accent = accent
    },
    update(dt, visitors) {
      updateDoors(doors, dt, visitors)
      for (const rt of rooms.values()) {
        rt.power = damp(rt.power, rt.target, 2.6, dt)
        const p = rt.power
        for (const mat of rt.strips) mat.emissiveIntensity = p * 1.9
        for (const l of rt.lights) l.intensity = p * (l.userData.warm ? 11 : 20)
        for (const mat of rt.signMats) {
          const v = 0.3 + 0.7 * p
          mat.color.setRGB(v, v, v)
        }
        for (const h of rt.holo) {
          h.scale.setScalar(Math.max(0.001, p))
          h.visible = p > 0.05
        }
      }
      animateProps(ctx, dt)
    },
  }
  return ship
}

function ensureRoom(rooms: Map<string, RoomRuntime>, def: RoomDef): RoomRuntime {
  let rt = rooms.get(def.id)
  if (!rt) {
    rt = {
      id: def.id,
      def,
      accent: ACCENT[def.accent],
      power: def.dormant ? 0.1 : 1,
      target: def.dormant ? 0.1 : 1,
      lights: [],
      strips: [],
      holo: [],
      signMats: [],
      signs: [],
      active: !def.dormant,
    }
    rooms.set(def.id, rt)
  }
  return rt
}

// ---------------------------------------------------------------------------
// Shells
// ---------------------------------------------------------------------------

function buildTunnel(ctx: PropCtx, room: RoomDef, side: 1 | -1) {
  const z = room.center[1]
  const inner = side > 0 ? 7.6 : -7.6
  const outer = side > 0 ? 3.6 : -3.6
  const a0 = Math.min(inner, outer)
  const a1 = Math.max(inner, outer)
  const cx = (a0 + a1) / 2
  const w = a1 - a0 + 1.6
  ctx.batch.at(rbox(w, 0.5, 8.6, 0.05), M.floor, cx, -0.25, z)
  ctx.batch.at(box(w * 0.94, 0.06, 8.0), M.floorPanel, cx, 0.02, z)
  ctx.batch.at(rbox(w, 0.5, 8.6, 0.05), M.hull, cx, SPINE_H + 0.25, z)
  for (const s of [-1, 1]) {
    wallRun(ctx, M.hull, 'x', z + s * 4.3, a0, a1, SPINE_H, 0.6, [], {
      ribs: false,
      inward: s > 0 ? -1 : 1,
    })
  }
  ctx.batch.at(box(w * 0.9, 0.12, 0.4), M.lampWarm, cx, SPINE_H - 0.45, z)
}

function buildRectShell(ctx: PropCtx, room: RoomDef) {
  const [cx, cz] = room.center
  const [w, d] = room.size
  const h = room.height
  const hw = w / 2
  const hd = d / 2
  const t = 0.7

  ctx.batch.at(rbox(w + 2, 0.5, d + 2, 0.05), M.floor, cx, -0.25, cz)
  const nx = Math.max(1, Math.round(w / 6))
  const nz = Math.max(1, Math.round(d / 6))
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      ctx.batch.at(
        box((w / nx) * 0.94, 0.06, (d / nz) * 0.94),
        M.floorPanel,
        cx - w / 2 + (w / nx) * (i + 0.5),
        0.02,
        cz - d / 2 + (d / nz) * (j + 0.5),
      )
    }
  }
  ctx.batch.at(rbox(w + 2, 0.5, d + 2, 0.05), M.hull, cx, h + 0.25, cz)

  const door = room.doors[0]
  const gapX: Gap[] =
    door.side === 'N' || door.side === 'S'
      ? [{ at: cx + door.at, width: door.width, top: DOOR_TOP }]
      : []
  const gapZ: Gap[] =
    door.side === 'E' || door.side === 'W'
      ? [{ at: cz + door.at, width: door.width, top: DOOR_TOP }]
      : []

  const acc = { accent: room.accent } as WallOpts
  wallRun(ctx, M.hull, 'x', cz - hd - t / 2, cx - hw - t, cx + hw + t, h, t, door.side === 'N' ? gapX : [], { ...acc, inward: 1 })
  wallRun(ctx, M.hull, 'x', cz + hd + t / 2, cx - hw - t, cx + hw + t, h, t, door.side === 'S' ? gapX : [], { ...acc, inward: -1 })
  wallRun(ctx, M.hull, 'z', cx - hw - t / 2, cz - hd - t, cz + hd + t, h, t, door.side === 'W' ? gapZ : [], { ...acc, inward: 1 })
  wallRun(ctx, M.hull, 'z', cx + hw + t / 2, cz - hd - t, cz + hd + t, h, t, door.side === 'E' ? gapZ : [], { ...acc, inward: -1 })

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      ctx.batch.at(rbox(1.2, h, 1.2, 0.12), M.hullDeep, cx + sx * hw, h / 2, cz + sz * hd)
    }
  }
  const ribs = Math.max(2, Math.round(d / 5))
  for (let i = 0; i < ribs; i++) {
    ctx.batch.at(rbox(w + 0.6, 0.4, 0.45, 0.06), M.hullDeep, cx, h - 0.2, cz - d / 2 + (d / ribs) * (i + 0.5))
  }
  for (let i = 0; i < 2; i++) {
    ctx.batch.at(box(w * 0.32, 0.12, 0.7), M.lampWarm, cx - w * 0.2 + i * w * 0.4, h - 0.44, cz)
  }
}

function buildDockShell(ctx: PropCtx, room: RoomDef) {
  const [cx, cz] = room.center
  const [w, d] = room.size
  const h = room.height
  const t = 0.8
  ctx.batch.at(rbox(w + 2, 0.5, d + 2, 0.05), M.floor, cx, -0.25, cz)
  const nx = Math.round(w / 6)
  const nz = Math.round(d / 6)
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      ctx.batch.at(
        box((w / nx) * 0.94, 0.06, (d / nz) * 0.94),
        M.floorPanel,
        cx - w / 2 + (w / nx) * (i + 0.5),
        0.02,
        cz - d / 2 + (d / nz) * (j + 0.5),
      )
    }
  }
  ctx.batch.at(rbox(w + 2, 0.5, d + 2, 0.05), M.hull, cx, h + 0.25, cz)
  const gaps: Gap[] = [{ at: cx, width: 12.4, top: DOOR_TOP }]
  wallRun(ctx, M.hull, 'x', cz - d / 2 - t / 2, cx - w / 2 - t, cx + w / 2 + t, h, t, gaps, { accent: 'cyan', inward: 1 })
  wallRun(ctx, M.hull, 'x', cz + d / 2 + t / 2, cx - w / 2 - t, cx + w / 2 + t, h, t, gaps, { accent: 'cyan', inward: -1 })
  wallRun(ctx, M.hull, 'z', cx - w / 2 - t / 2, cz - d / 2 - t, cz + d / 2 + t, h, t, [], { accent: 'cyan', inward: 1 })
  wallRun(ctx, M.hull, 'z', cx + w / 2 + t / 2, cz - d / 2 - t, cz + d / 2 + t, h, t, [], { accent: 'cyan', inward: -1 })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      ctx.batch.at(rbox(1.4, h, 1.4, 0.12), M.hullDeep, cx + (sx * w) / 2, h / 2, cz + (sz * d) / 2)
    }
  }
  for (const sx of [-1, 1]) {
    for (const z of [cz - 9, cz, cz + 9]) {
      porthole(ctx, cx + (sx * w) / 2, 5.2, z, (sx * Math.PI) / 2, 1.6)
    }
  }
}

function buildCommandShell(ctx: PropCtx) {
  const r = COMMAND_RADIUS
  const cz = COMMAND_CENTER
  const h = 11
  const gapDoor = { a: Math.PI, half: Math.asin(SPINE_HALF / r) + 0.015 }
  const winA = { a: 0.92, half: 0.47 }
  const winB = { a: -0.92, half: 0.47 }

  ringWall(ctx, M.shell, 0, cz, r, 0, 1.85, [gapDoor])
  ringWall(ctx, M.shell, 0, cz, r, 6.9, h, [gapDoor])
  ringWall(ctx, M.shell, 0, cz, r, 1.85, 6.9, [gapDoor, winA, winB])
  roundPlate(ctx, M.shellFloor, 0, 0, cz, r + 0.6, false)
  roundPlate(ctx, M.shell, 0, h + 0.4, cz, r + 0.6, true)

  ctx.batch.at(tube(r - 3.2, 0.09, 64), M.glow(C.cyan, 0.7), 0, 0.07, cz, 0, Math.PI / 2)
  ctx.batch.at(tube(r - 8.6, 0.07, 64), M.glow(C.cyan, 0.5), 0, 0.07, cz, 0, Math.PI / 2)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    ctx.batch.at(box(0.5, 0.06, 1.6), M.floorPanel, Math.sin(a) * (r - 5.9), 0.03, cz + Math.cos(a) * (r - 5.9), a)
  }

  for (const win of [winA, winB]) windowBay(ctx, 0, cz, r, win.a - win.half, win.a + win.half)

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2
    const px = Math.sin(a) * (r - 5)
    const pz = cz + Math.cos(a) * (r - 5)
    ctx.batch.at(rbox(2.6, 1.1, 2.6, 0.14), M.hullDeep, px, h - 0.9, pz, a)
    ctx.batch.at(cyl(0.7, 0.9, 0.5, 16), M.steel, px, h - 1.6, pz)
    ctx.batch.at(cyl(0.5, 0.5, 0.16, 16), M.glow(C.cyan, 1.2), px, h - 1.95, pz)
    if (i % 2 === 0) {
      ctx.batch.at(cyl(0.24, 0.24, 5.0, 10), M.dark, px, h - 4.4, pz)
      ctx.batch.at(sph(0.4), M.hull, px, h - 6.9, pz)
    }
  }
  ctx.batch.at(cyl(r - 2.2, r - 2.2, 0.3, 56, true), M.shell, 0, h - 0.5, cz)
  roundPlate(ctx, M.shell, 0, h - 0.68, cz, r - 2.4, true)
  ctx.batch.at(tube(3.0, 0.16, 40), M.glow(C.cyan, 1.4), 0, h - 0.74, cz, 0, Math.PI / 2)
  ctx.batch.at(tube(6.0, 0.12, 48), M.glow(C.cyan, 1.0), 0, h - 0.76, cz, 0, Math.PI / 2)
}

function windowBay(ctx: PropCtx, cx: number, cz: number, r: number, a0: number, a1: number) {
  const mid = (a0 + a1) / 2
  const y0 = 1.9
  const y1 = 6.85
  shellArc(ctx, M.glass, cx, cz, r - 0.06, y0, y1, a0, a1 - a0)
  const sill = new THREE.RingGeometry(r - 0.7, r + 0.5, 22, 1, a0 - Math.PI / 2, a1 - a0)
  ctx.batch.at(sill, M.hullSoft, cx, y0, cz, 0, -Math.PI / 2)
  const head = new THREE.RingGeometry(r - 0.7, r + 0.5, 22, 1, a0 - Math.PI / 2, a1 - a0)
  ctx.batch.at(head, M.hullSoft, cx, y1, cz, 0, -Math.PI / 2)
  for (let i = 0; i <= 4; i++) {
    const a = a0 + ((a1 - a0) * i) / 4
    ctx.batch.at(box(0.36, y1 - y0, 0.5), M.hullSoft, cx + Math.sin(a) * r, (y0 + y1) / 2, cz + Math.cos(a) * r, a)
  }
  ctx.batch.at(
    box(0.5, 0.16, 2.6),
    M.glow(C.cyan, 1.1),
    cx + Math.sin(mid) * (r - 0.35),
    y0 + 0.18,
    cz + Math.cos(mid) * (r - 0.35),
    mid,
  )
  // a bench you can look out from
  const bR = r - 2.6
  ctx.batch.at(rbox(7.0, 0.55, 2.2, 0.16), M.hullSoft, cx + Math.sin(mid) * bR, 0.78, cz + Math.cos(mid) * bR, mid)
  ctx.batch.at(rbox(7.4, 0.16, 2.6, 0.08), M.floorPanel, cx + Math.sin(mid) * bR, 1.07, cz + Math.cos(mid) * bR, mid)
}

function buildRotunda(ctx: PropCtx, kind: 'hq' | 'mission' | 'archive', cx: number, cz: number, r: number) {
  const h = kind === 'hq' ? 12 : kind === 'archive' ? 8.5 : 11
  const spineHalf = Math.asin(SPINE_HALF / r) + 0.01
  const gaps: { a: number; half: number }[] = []
  if (kind === 'hq') {
    gaps.push({ a: Math.PI, half: spineHalf }, { a: 0, half: spineHalf })
  } else if (kind === 'mission') {
    gaps.push({ a: 0, half: spineHalf }, { a: -Math.PI / 2, half: Math.asin(3.5 / r) + 0.03 })
  } else {
    gaps.push({ a: Math.PI / 2, half: Math.asin(3.5 / r) + 0.03 })
  }

  ringWall(ctx, M.shell, cx, cz, r, 0, h, gaps)
  roundPlate(ctx, M.shellFloor, cx, 0, cz, r + 0.4, false)
  roundPlate(ctx, M.shell, cx, h + 0.4, cz, r + 0.4, true)
  ctx.batch.at(tube(r - 1.1, 0.08, 64), M.glow(C.cyan, 0.6), cx, 0.07, cz, 0, Math.PI / 2)
  ctx.batch.at(cyl(r - 1.6, r - 1.6, 0.7, 48, true), M.shell, cx, h - 1.2, cz)
  ctx.batch.at(tube(r - 2.4, 0.12, 48), M.glow(C.cyan, 1.0), cx, h - 1.6, cz, 0, Math.PI / 2)

  if (kind === 'hq') {
    for (const s of [-1, 1]) {
      ctx.batch.at(box(SPINE_HALF * 2 + 2.4, 0.6, 0.9), M.dark, cx, 7.2, cz + s * (r - 0.6))
      ctx.batch.at(box(SPINE_HALF * 2 + 1.8, 0.14, 0.3), M.glow(C.cyan, 1.2), cx, 6.8, cz + s * (r - 0.95))
    }
    porthole(ctx, cx + r, 5.4, cz, Math.PI / 2, 1.8)
    porthole(ctx, cx - r, 5.4, cz, -Math.PI / 2, 1.8)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.42
      const px = cx + Math.sin(a) * (r - 1.5)
      const pz = cz + Math.cos(a) * (r - 1.5)
      ctx.batch.at(box(1.0, 2.6, 0.4), M.hullDeep, px, 5.2, pz, a)
      ctx.batch.at(box(0.62, 1.9, 0.1), M.glow(C.cyan, 0.55), px - Math.sin(a) * 0.26, 5.2, pz - Math.cos(a) * 0.26, a)
    }
  }
  if (kind === 'mission') {
    for (const a of [Math.PI / 3, (Math.PI * 2) / 3]) {
      porthole(ctx, cx + Math.sin(a) * r, 5.6, cz + Math.cos(a) * r, a, 1.7)
    }
  }
  if (kind === 'archive') {
    for (const a of [-Math.PI / 2, Math.PI]) {
      porthole(ctx, cx + Math.sin(a) * r, 5.4, cz + Math.cos(a) * r, a, 1.5)
    }
  }
}

function buildArchiveHall(ctx: PropCtx) {
  const x0 = -33.6
  const x1 = -18.4
  const z = MISSION_CENTER
  const cx = (x0 + x1) / 2
  const w = x1 - x0
  ctx.batch.at(rbox(w, 0.5, 8.6, 0.05), M.floor, cx, -0.25, z)
  ctx.batch.at(box(w * 0.94, 0.06, 8.0), M.floorPanel, cx, 0.02, z)
  ctx.batch.at(rbox(w, 0.5, 8.6, 0.05), M.hull, cx, 6.5, z)
  for (const s of [-1, 1]) {
    wallRun(ctx, M.hull, 'x', z + s * 4.3, x0, x1, 6.5, 0.6, [], { accent: 'gold', inward: s > 0 ? -1 : 1 })
  }
  ctx.batch.at(box(w * 0.8, 0.12, 0.4), M.lampWarm, cx, 6.05, z)
  ctx.batch.at(box(0.14, 0.05, 7.6), M.glow(ACCENT.gold, 0.5), cx - 1.5, 0.07, z)
  ctx.batch.at(box(0.14, 0.05, 7.6), M.glow(ACCENT.gold, 0.5), cx + 1.5, 0.07, z)
}

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

function buildDoor(
  ctx: PropCtx,
  name: string,
  x: number,
  z: number,
  axis: 'x' | 'z',
  width: number,
  accent: AccentName,
): DoorRuntime {
  const color = ACCENT[accent]
  const h = DOOR_TOP
  const alongZ = axis === 'z'
  const jamb = 0.5

  for (const s of [-1, 1]) {
    const off = s * (width / 2 - jamb / 2)
    const jx = alongZ ? x : x + off
    const jz = alongZ ? z + off : z
    ctx.batch.at(rbox(alongZ ? 1.2 : jamb, h, alongZ ? jamb : 1.2, 0.08), M.dark, jx, h / 2, jz)
  }
  ctx.batch.at(
    rbox(alongZ ? 1.2 : width + jamb, 0.34, alongZ ? width + jamb : 1.2, 0.08),
    M.dark,
    x,
    h + 0.17,
    z,
  )
  ctx.batch.at(
    box(alongZ ? 0.72 : width * 0.9, 0.1, alongZ ? width * 0.9 : 0.72),
    M.glow(color, 1.4),
    x,
    h + 0.02,
    z,
  )

  const group = new THREE.Group()
  group.position.set(x, 0, z)
  const leafLen = width / 2 - 0.1
  const leafGeo = rbox(alongZ ? 0.26 : leafLen, h - 0.55, alongZ ? leafLen : 0.26, 0.07)
  const stripeGeo = box(alongZ ? 0.3 : leafLen * 0.7, 0.1, alongZ ? leafLen * 0.7 : 0.3)

  const mk = (s: number) => {
    const leaf = new THREE.Mesh(leafGeo, M.hullSoft)
    leaf.receiveShadow = true
    const stripe = new THREE.Mesh(stripeGeo, M.glow(color, 1.0))
    const holder = new THREE.Group()
    const local = (alongZ ? 0 : (s * width) / 4) * 1
    leaf.position.set(alongZ ? 0 : local, (h - 0.55) / 2 + 0.1, alongZ ? local : 0)
    stripe.position.set(leaf.position.x, h * 0.58, leaf.position.z)
    holder.add(leaf, stripe)
    group.add(holder)
    return holder
  }
  const left = mk(-1)
  const right = mk(1)
  ctx.register(name, group)
  return {
    group,
    left,
    right,
    baseLeft: left.position.clone(),
    baseRight: right.position.clone(),
    x,
    z,
    axis,
    width,
    open: 0,
    target: 0,
  }
}

function updateDoors(doors: DoorRuntime[], dt: number, visitors: { x: number; z: number; r: number }[]) {
  for (const d of doors) {
    let want = 0
    for (const v of visitors) {
      if (Math.hypot(v.x - d.x, v.z - d.z) < 7 + v.r) {
        want = 1
        break
      }
    }
    d.target = want
    d.open = damp(d.open, d.target, 5.5, dt)
    const slide = d.open * (d.width / 2 - 0.06)
    if (d.axis === 'z') {
      d.left.position.z = d.baseLeft.z - slide
      d.right.position.z = d.baseRight.z + slide
    } else {
      d.left.position.x = d.baseLeft.x - slide
      d.right.position.x = d.baseRight.x + slide
    }
  }
}

// ---------------------------------------------------------------------------
// Continuous life: spinning rings, drifting holograms
// ---------------------------------------------------------------------------

function animateProps(ctx: PropCtx, dt: number) {
  const t = performance.now() / 1000
  for (const obj of ctx.registry.values()) {
    const spin = obj.userData.spin as number | undefined
    if (spin) obj.rotation.y += spin * dt
    if (obj.userData.kind === 'hq-board') {
      obj.position.y += Math.sin(t * 1.3 + (obj.userData.index ?? 0)) * dt * 0.07
    }
  }
  const globe = ctx.get('holo:mission:globe')
  if (globe) {
    globe.rotation.y += dt * 0.12
    const r1 = globe.userData.ring1 as THREE.Mesh | undefined
    const r2 = globe.userData.ring2 as THREE.Mesh | undefined
    if (r1) r1.rotation.z += dt * 0.3
    if (r2) r2.rotation.z -= dt * 0.22
    const markers = globe.userData.markers as THREE.Mesh[] | undefined
    markers?.forEach((m, i) => {
      m.rotation.y += dt * (0.6 + i * 0.12)
      m.position.y += Math.sin(t * 2 + i) * dt * 0.5
    })
  }
  const archive = ctx.get('holo:archive')
  if (archive) archive.rotation.y += dt * 0.25
}
