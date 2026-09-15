import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { M, C, ACCENT, type AccentName } from '../core/palette'
import { MeshBatch } from '../core/batch'
import { obstacleFromBox, type Anchor, type Obstacle } from './nav'
import {
  plateTexture,
  signTexture,
  screenTexture,
  roleIconTexture,
  makeCanvas,
  toTexture,
  hex,
} from '../core/textures'
import { makeRng } from '../core/math'

// ---------------------------------------------------------------------------
// Cached primitives — the whole ship is built from these.
// ---------------------------------------------------------------------------

const geoCache = new Map<string, THREE.BufferGeometry>()

export function rbox(w: number, h: number, d: number, r = 0.12, seg = 2) {
  const rad = Math.max(0.005, Math.min(r, Math.min(w, h, d) / 2 - 0.001))
  const key = `rb|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${rad.toFixed(3)}|${seg}`
  let g = geoCache.get(key)
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, seg, rad)
    geoCache.set(key, g)
  }
  return g
}

export function box(w: number, h: number, d: number) {
  const key = `b|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`
  let g = geoCache.get(key)
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d)
    geoCache.set(key, g)
  }
  return g
}

export function cyl(rTop: number, rBottom: number, h: number, seg = 20, open = false) {
  const key = `c|${rTop.toFixed(3)}|${rBottom.toFixed(3)}|${h.toFixed(3)}|${seg}|${open}`
  let g = geoCache.get(key)
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open)
    geoCache.set(key, g)
  }
  return g
}

export function tube(radius: number, thick: number, seg = 18) {
  const key = `t|${radius.toFixed(3)}|${thick.toFixed(3)}|${seg}`
  let g = geoCache.get(key)
  if (!g) {
    g = new THREE.TorusGeometry(radius, thick, 8, seg)
    geoCache.set(key, g)
  }
  return g
}

export function sph(radius: number, seg = 18) {
  const key = `s|${radius.toFixed(3)}|${seg}`
  let g = geoCache.get(key)
  if (!g) {
    g = new THREE.SphereGeometry(radius, seg, Math.max(8, seg / 2))
    geoCache.set(key, g)
  }
  return g
}

export function plane(w: number, h: number) {
  const key = `p|${w.toFixed(3)}|${h.toFixed(3)}`
  let g = geoCache.get(key)
  if (!g) {
    g = new THREE.PlaneGeometry(w, h)
    geoCache.set(key, g)
  }
  return g
}

// ---------------------------------------------------------------------------
// Build context shared by every prop
// ---------------------------------------------------------------------------

export interface PropCtx {
  batch: MeshBatch
  /** Anything that animates lives here instead of in the batch. */
  dynamic: THREE.Group
  obstacles: Obstacle[]
  anchors: Anchor[]
  lights: THREE.Group
  rng: () => number
  /** Named lookup for every animated object in the ship. */
  registry: Map<string, THREE.Object3D>
  /** Register an animated object so systems can find it later. */
  register(name: string, obj: THREE.Object3D): void
  get<T extends THREE.Object3D = THREE.Object3D>(name: string): T | undefined
}

export function makeCtx(): PropCtx {
  const batch = new MeshBatch()
  const dynamic = new THREE.Group()
  dynamic.name = 'dynamic'
  const lights = new THREE.Group()
  lights.name = 'lights'
  const registry = new Map<string, THREE.Object3D>()
  return {
    batch,
    dynamic,
    lights,
    obstacles: [],
    anchors: [],
    rng: makeRng(20260915),
    registry,
    register(name, obj) {
      obj.name = name
      registry.set(name, obj)
      dynamic.add(obj)
    },
    get<T extends THREE.Object3D>(name: string) {
      return registry.get(name) as T | undefined
    },
  }
}

export function solidBox(ctx: PropCtx, cx: number, cz: number, w: number, d: number) {
  ctx.obstacles.push(obstacleFromBox(cx, cz, w, d))
}

export function solidCircle(ctx: PropCtx, cx: number, cz: number, r: number) {
  ctx.obstacles.push({ kind: 'circle', x: cx, z: cz, r })
}

export function anchor(
  ctx: PropCtx,
  id: string,
  roomId: string,
  kind: string,
  x: number,
  z: number,
  face: [number, number] = [0, -1],
) {
  ctx.anchors.push({ id, roomId, kind, x, z, fx: face[0], fz: face[1] })
}

/** Local -> world for a prop with a Y rotation, so we can place its parts. */
function local(x: number, z: number, ry: number, ox: number, oz: number): [number, number] {
  const c = Math.cos(ry)
  const s = Math.sin(ry)
  return [x + ox * c + oz * s, z + -ox * s + oz * c]
}

// ---------------------------------------------------------------------------
// Structural modules
// ---------------------------------------------------------------------------

export interface WallOptions {
  height?: number
  thickness?: number
  accent?: AccentName
  trim?: boolean
  ribs?: boolean
  glassTop?: number
}

/** A straight wall run between two points on one axis, with panel detailing. */
export function SpaceshipWall(
  ctx: PropCtx,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  opt: WallOptions = {},
) {
  const h = opt.height ?? 6.5
  const t = opt.thickness ?? 0.6
  const horizontal = Math.abs(x1 - x0) > Math.abs(z1 - z0)
  const len = horizontal ? Math.abs(x1 - x0) : Math.abs(z1 - z0)
  if (len < 0.05) return
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const ry = horizontal ? 0 : Math.PI / 2

  // main slab
  ctx.batch.at(rbox(horizontal ? len : t, h, horizontal ? t : len, 0.06), M.hull, cx, h / 2, cz)
  // dark kick plate + top rail
  ctx.batch.at(
    rbox(horizontal ? len : t + 0.12, 0.7, horizontal ? t + 0.12 : len, 0.05),
    M.darker,
    cx,
    0.35,
    cz,
  )
  if (opt.trim !== false) {
    ctx.batch.at(
      rbox(horizontal ? len : t + 0.2, 0.32, horizontal ? t + 0.2 : len, 0.06),
      M.dark,
      cx,
      h - 0.16,
      cz,
    )
  }
  // inset panels along the wall
  const panels = Math.max(1, Math.round(len / 4.5))
  const step = len / panels
  for (let i = 0; i < panels; i++) {
    const off = -len / 2 + step * (i + 0.5)
    const px = horizontal ? cx + off : cx
    const pz = horizontal ? cz : cz + off
    const w = step * 0.72
    const [ix, iz] = local(px, pz, ry, 0, t / 2 + 0.03)
    ctx.batch.at(rbox(horizontal ? w : 0.06, h - 1.9, horizontal ? 0.06 : w, 0.03), M.hullDeep, ix, h / 2 + 0.15, iz, ry)
    if (opt.ribs !== false) {
      const [rx, rz] = local(px, pz, ry, 0, t / 2 + 0.1)
      ctx.batch.at(rbox(horizontal ? 0.22 : 0.18, h - 1.4, horizontal ? 0.18 : 0.22, 0.04), M.dark, rx, h / 2 + 0.1, rz, ry)
    }
  }
  if (opt.glassTop) {
    const gy = h - opt.glassTop / 2 - 0.4
    ctx.batch.at(
      rbox(horizontal ? len : t * 0.6, opt.glassTop, horizontal ? t * 0.6 : len, 0.02),
      M.glass,
      cx,
      gy,
      cz,
    )
  }
  if (opt.accent && opt.accent !== 'none') {
    const color = ACCENT[opt.accent]
    const [ax, az] = local(cx, cz, ry, 0, t / 2 + 0.06)
    ctx.batch.at(rbox(horizontal ? len * 0.94 : 0.08, 0.1, horizontal ? 0.08 : len * 0.94, 0.02), M.glow(color, 1.1), ax, 1.1, az, ry)
  }
}

/** Deck plating with panel joints and perimeter light strips. */
export function SpaceshipFloor(
  ctx: PropCtx,
  center: [number, number],
  size: [number, number],
  accent: AccentName = 'cyan',
) {
  const [cx, cz] = center
  const [w, d] = size
  ctx.batch.at(rbox(w, 0.5, d, 0.05), M.floor, cx, -0.25, cz)
  // panel grid
  const nx = Math.max(1, Math.round(w / 6))
  const nz = Math.max(1, Math.round(d / 6))
  const sx = w / nx
  const sz = d / nz
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const [px, pz] = local(cx, cz, 0, -w / 2 + sx * (i + 0.5), -d / 2 + sz * (j + 0.5))
      ctx.batch.at(box(sx * 0.94, 0.06, sz * 0.94), M.floorPanel, px, 0.02, pz)
    }
  }
  if (accent !== 'none') {
    const color = ACCENT[accent]
    // two guide strips running the length of the deck
    ctx.batch.at(box(0.16, 0.04, d * 0.92), M.glow(color, 0.75), cx - w / 2 + 1.2, 0.06, cz)
    ctx.batch.at(box(0.16, 0.04, d * 0.92), M.glow(color, 0.75), cx + w / 2 - 1.2, 0.06, cz)
  }
}

/** Ceiling: slab, light coves, structural ribs and conduits. */
export function SpaceshipCeiling(
  ctx: PropCtx,
  center: [number, number],
  size: [number, number],
  height: number,
  opt: { ribAxis?: 'x' | 'z'; lights?: boolean; conduits?: boolean } = {},
) {
  const [cx, cz] = center
  const [w, d] = size
  ctx.batch.at(rbox(w, 0.5, d, 0.05), M.hull, cx, height + 0.25, cz)
  const axis = opt.ribAxis ?? (w > d ? 'z' : 'x')
  const span = axis === 'z' ? d : w
  const n = Math.max(2, Math.round(span / 5))
  for (let i = 0; i < n; i++) {
    const off = -span / 2 + (span / n) * (i + 0.5)
    const px = axis === 'z' ? cx : cx + off
    const pz = axis === 'z' ? cz + off : cz
    ctx.batch.at(
      rbox(axis === 'z' ? w * 0.98 : 0.5, 0.5, axis === 'z' ? 0.5 : d * 0.98, 0.06),
      M.hullDeep,
      px,
      height - 0.1,
      pz,
    )
  }
  if (opt.lights !== false) {
    const nz = Math.max(1, Math.round(d / 9))
    const nx = Math.max(1, Math.round(w / 9))
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const px = cx - w / 2 + (w / nx) * (i + 0.5)
        const pz = cz - d / 2 + (d / nz) * (j + 0.5)
        ctx.batch.at(box(w / nx * 0.55, 0.14, d / nz * 0.34), M.lampWarm, px, height - 0.36, pz)
        ctx.batch.at(rbox(w / nx * 0.66, 0.22, d / nz * 0.46, 0.05), M.hullDeep, px, height - 0.2, pz)
      }
    }
  }
  if (opt.conduits) {
    ctx.batch.at(cyl(0.28, 0.28, w * 0.96, 12), M.dark, cx, height - 0.75, cz - d / 2 + 1.6, Math.PI / 2, Math.PI / 2)
    ctx.batch.at(cyl(0.2, 0.2, w * 0.96, 10), M.steel, cx, height - 1.15, cz - d / 2 + 1.6, Math.PI / 2, Math.PI / 2)
  }
}

export interface DoorwayOpts {
  width: number
  height?: number
  auto?: boolean
  accent?: AccentName
  /** Where the doorway sits, in world space, and which way the wall runs. */
  axis: 'x' | 'z'
}

/**
 * AutomaticDoor — a framed opening with two sliding leaves and a status light.
 * Returns the moving parts so the simulation can open them for nearby visitors.
 */
export function AutomaticDoor(
  ctx: PropCtx,
  name: string,
  x: number,
  z: number,
  opt: DoorwayOpts,
) {
  const h = opt.height ?? 6.5
  const w = opt.width
  const alongX = opt.axis === 'x'
  const accent = ACCENT[opt.accent ?? 'cyan']

  // frame
  const jamb = 0.45
  for (const s of [-1, 1]) {
    const [jx, jz] = local(x, z, 0, s * (w / 2 + jamb / 2), 0)
    ctx.batch.at(rbox(alongX ? jamb : 0.9, h, alongX ? 0.9 : jamb, 0.08), M.dark, jx, h / 2, jz)
  }
  ctx.batch.at(rbox(alongX ? w + jamb * 2 : 0.9, 0.55, alongX ? 0.9 : w + jamb * 2, 0.08), M.dark, x, h - 0.27, z)

  // leaves
  const leaves = new THREE.Group()
  leaves.position.set(x, 0, z)
  const leafGeo = rbox(alongX ? w / 2 : 0.22, h - 1.2, alongX ? 0.22 : w / 2, 0.06)
  for (const s of [-1, 1]) {
    const leaf = new THREE.Mesh(leafGeo, M.hullSoft)
    leaf.castShadow = true
    leaf.receiveShadow = true
    leaf.position.set(alongX ? (s * w) / 4 : 0, (h - 1.2) / 2 + 0.1, alongX ? 0 : (s * w) / 4)
    const stripe = new THREE.Mesh(
      alongX ? box(w * 0.32, 0.1, 0.26) : box(0.26, 0.1, w * 0.32),
      M.glow(accent, 1.0),
    )
    stripe.position.set(leaf.position.x, h * 0.62, leaf.position.z)
    leaves.add(leaf, stripe)
  }
  ctx.register(name, leaves)

  // status lamp above the frame
  const lamp = new THREE.Mesh(sph(0.16), M.glow(accent, 1.6))
  lamp.position.set(x, h - 0.72, z)
  ctx.batch.at(sph(0.16), M.glow(accent, 1.6), x, h - 0.72, z)
  void lamp

  // signage
  if (opt.auto !== false) {
    const tex = plateTexture('AUTO', '')
    const sign = new THREE.Mesh(
      plane(1.5, 0.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }),
    )
    sign.position.set(x, h - 1.3, z + (alongX ? 0.5 : 0))
    if (!alongX) sign.rotation.y = Math.PI / 2
    ctx.register(`${name}:plate`, sign)
  }
  return { leaves, width: w }
}

/** Simple archway: no leaves, just a framed opening for open-plan rotundas. */
export function Archway(ctx: PropCtx, x: number, z: number, w: number, h: number, axis: 'x' | 'z') {
  const alongX = axis === 'x'
  for (const s of [-1, 1]) {
    const [jx, jz] = local(x, z, 0, s * (w / 2 + 0.3), 0)
    ctx.batch.at(rbox(alongX ? 0.6 : 1.1, h, alongX ? 1.1 : 0.6, 0.08), M.hullSoft, jx, h / 2, jz)
  }
  ctx.batch.at(rbox(alongX ? w + 1.8 : 1.1, 0.6, alongX ? 1.1 : w + 1.8, 0.08), M.dark, x, h - 0.3, z)
  ctx.batch.at(rbox(alongX ? w * 0.9 : 0.12, 0.12, alongX ? 0.12 : w * 0.9, 0.03), M.glow(C.cyan, 1.2), x, h - 0.68, z)
}

/** Corridor dressing: ribs, floor strips and ceiling conduits. */
export function Corridor(
  ctx: PropCtx,
  center: [number, number],
  size: [number, number],
  height: number,
  axis: 'x' | 'z',
) {
  const [cx, cz] = center
  const [w, d] = size
  const span = axis === 'z' ? d : w
  const ribs = Math.max(1, Math.round(span / 6))
  for (let i = 0; i < ribs; i++) {
    const off = -span / 2 + (span / ribs) * (i + 0.5)
    const px = axis === 'z' ? cx : cx + off
    const pz = axis === 'z' ? cz + off : cz
    ctx.batch.at(rbox(axis === 'z' ? w + 0.4 : 0.4, 0.5, axis === 'z' ? 0.4 : d + 0.4, 0.08), M.hullDeep, px, height - 0.3, pz)
  }
}

// ---------------------------------------------------------------------------
// Interactive / functional props
// ---------------------------------------------------------------------------

/** A floor console: pedestal, angled screen, keyboard. */
export function ComputerTerminal(
  ctx: PropCtx,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'cyan',
  variant: 'desk' | 'wall' | 'pillar' = 'desk',
) {
  const color = ACCENT[accent]
  if (variant === 'pillar') {
    ctx.batch.at(rbox(3.2, 3.4, 0.7, 0.12), M.hull, x, 1.7, z, ry)
    ctx.batch.at(rbox(3.4, 0.3, 0.9, 0.08), M.dark, x, 3.5, z, ry)
    ctx.batch.at(box(2.6, 0.22, 0.1), M.glow(color, 1.0), x, 1.2, z, ry)
    const [sx, sz] = local(x, z, ry, 0, 0.42)
    ctx.batch.at(plane(2.9, 1.9), M.black, sx, 2.1, sz, ry)
    const scr = new THREE.Mesh(
      plane(2.7, 1.75),
      new THREE.MeshBasicMaterial({ map: screenTexture(color, Math.floor(Math.abs(x + z)), 'status') }),
    )
    scr.position.set(sx, 2.1, sz + 0.02)
    scr.rotation.y = ry
    attachScreen(scr, color)
    ctx.register(`screen:${x.toFixed(1)}:${z.toFixed(1)}`, scr)
    solidBox(ctx, x, z, 3.4, 1.2)
    return
  }
  // desk console
  ctx.batch.at(rbox(2.6, 0.24, 1.5, 0.1), M.hullSoft, x, 1.05, z, ry)
  ctx.batch.at(rbox(1.0, 1.0, 0.9, 0.1), M.dark, x, 0.52, z, ry)
  ctx.batch.at(rbox(2.4, 0.5, 0.16, 0.06), M.hull, x, 1.35, z, ry)
  const [bx, bz] = local(x, z, ry, 0, 0.62)
  ctx.batch.at(rbox(3.0, 0.5, 0.1, 0.04), M.dark, bx, 1.5, bz, ry)
  const [sx, sz] = local(x, z, ry, 0, 0.35)
  ctx.batch.at(rbox(2.2, 1.4, 0.12, 0.06), M.darker, sx, 2.35, sz, ry)
  const scr = new THREE.Mesh(
    plane(2.0, 1.2),
    new THREE.MeshBasicMaterial({
      map: screenTexture(color, Math.floor(Math.abs(x * 3 + z)), variant === 'wall' ? 'graph' : 'code'),
    }),
  )
  scr.position.set(sx, 2.35, sz)
  scr.rotation.y = ry
  attachScreen(scr, color)
  ctx.register(`screen:${x.toFixed(1)}:${z.toFixed(1)}`, scr)
  solidBox(ctx, x, z, variant === 'wall' ? 3.4 : 2.8, 2.2)
}

/** Team Mate's central console on the command deck and in the HQ. */
export function CommandDesk(ctx: PropCtx, x: number, z: number, ry: number) {
  // long curved console
  const seg = 5
  for (let i = 0; i < seg; i++) {
    const a = (-0.5 + i / (seg - 1)) * 0.9
    const [px, pz] = local(x, z, ry, a * 5.4, 0)
    ctx.batch.at(rbox(5.6, 0.26, 1.7, 0.12), M.hullSoft, px, 1.08, pz, ry + a * 0.35)
    ctx.batch.at(box(5.2, 0.9, 1.4), M.hull, px, 0.5, pz, ry + a * 0.35)
    ctx.batch.at(box(5.4, 0.1, 0.14), M.glow(C.cyan, 0.8), px, 0.95, pz, ry + a * 0.35)
  }
  // holo screens floating over the desk
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * 0.62
    const [px, pz] = local(x, z, ry, a * 5.6, -0.5)
    const panel = new THREE.Mesh(plane(2.5, 1.5), M.holo(C.cyan, 0.22))
    panel.position.set(px, 3.0 + Math.abs(a) * 0.1, pz)
    panel.rotation.y = ry + a * 0.5
    ctx.register(`holo:desk:${i}`, panel)
    ctx.batch.at(box(2.7, 0.06, 0.06), M.dark, px, 3.8, pz, ry + a * 0.5)
  }
  solidBox(ctx, x, z, 13, 3.6)
}

/** The white floating pod from the reference sheet (static dressing only —
 *  the player's pod is built as a live entity in entities/developer.ts). */
export function DeveloperChairPod(ctx: PropCtx, x: number, z: number, ry: number) {
  ctx.batch.at(rbox(4.0, 0.6, 3.4, 0.42, 3), M.hull, x, 0.95, z, ry)
  ctx.batch.at(rbox(4.2, 1.6, 3.8, 1.0, 4), M.hull, x, 1.85, z, ry)
  ctx.batch.at(box(3.0, 0.5, 2.8, ), M.floorPanel, x, 1.15, z, ry)
  ctx.batch.at(box(2.4, 0.12, 0.14), M.glow(C.cyan, 1.2), x, 0.72, z + 1.8, ry)
  ctx.batch.at(cyl(0.9, 1.2, 0.3, 20), M.hullDeep, x, 0.6, z)
  solidCircle(ctx, x, z, 2.2)
}

/** Wall or floor mounted holographic projector. */
export function HolographicProjector(
  ctx: PropCtx,
  x: number,
  z: number,
  accent: AccentName = 'cyan',
  scale = 1,
) {
  const color = ACCENT[accent]
  ctx.batch.at(cyl(1.5 * scale, 1.9 * scale, 0.5, 24), M.hull, x, 0.25, z)
  ctx.batch.at(cyl(1.1 * scale, 1.3 * scale, 0.55, 24), M.dark, x, 0.72, z)
  ctx.batch.at(cyl(0.85 * scale, 0.85 * scale, 0.12, 24), M.glow(color, 1.4), x, 1.02, z)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    ctx.batch.at(box(0.1, 0.6, 0.1), M.steel, x + Math.cos(a) * 1.5 * scale, 0.5, z + Math.sin(a) * 1.5 * scale)
  }
  solidCircle(ctx, x, z, 1.8 * scale)
}

/**
 * Live ship displays.
 *
 * Every big screen in the ship can be repainted from simulation data rather
 * than being fixed at build time. `setScreen(kind, data)` is attached to the
 * registered screen object, and updateBoards() drives it.
 */
export interface ScreenRow {
  label: string
  value: string
  /** 0..1 fill for the row's progress bar; omit for a plain readout. */
  progress?: number
  accent?: number
}

export interface ScreenData {
  title?: string
  subtitle?: string
  rows?: ScreenRow[]
  accent?: number
}

const screenFont = (size: number, weight = 'bold') =>
  `${weight} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`

/** Repaint a live display from data. */
export function liveScreenTexture(kind: string, data: ScreenData, accent: number) {
  const W = 768
  const H = 384
  const { canvas, ctx } = makeCanvas(W, H)
  const ac = data.accent ?? accent
  const glow = hex(ac)
  ctx.fillStyle = '#0b161c'
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = glow
  ctx.globalAlpha = 0.13
  ctx.fillRect(0, 0, W, 66)
  ctx.globalAlpha = 1
  ctx.fillRect(0, 64, W, 3)
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#eaf4f8'
  ctx.font = screenFont(38, 'bold')
  ctx.fillText((data.title ?? kind).toUpperCase().slice(0, 26), 34, 34)
  ctx.fillStyle = glow
  ctx.font = screenFont(20, '600')
  ctx.textAlign = 'right'
  ctx.fillText((data.subtitle ?? kind.toUpperCase()).slice(0, 40), W - 34, 36)
  ctx.textAlign = 'left'

  const rows = (data.rows ?? []).slice(0, 5)
  if (!rows.length) {
    ctx.fillStyle = 'rgba(210,236,246,0.5)'
    ctx.font = screenFont(26, '600')
    ctx.fillText('STANDBY', 36, H / 2)
  }
  const top = 96
  const rowH = Math.min(56, (H - top - 24) / Math.max(1, rows.length))
  rows.forEach((row, i) => {
    const y = top + i * rowH
    const rowGlow = hex(row.accent ?? ac)
    ctx.fillStyle = 'rgba(210,236,246,0.92)'
    ctx.font = screenFont(24, '600')
    ctx.fillText(row.label.toUpperCase().slice(0, 30), 36, y + 12)
    ctx.fillStyle = rowGlow
    ctx.textAlign = 'right'
    ctx.font = screenFont(22, 'bold')
    ctx.fillText(row.value.slice(0, 30), W - 36, y + 12)
    ctx.textAlign = 'left'
    const bw = W - 72
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fillRect(36, y + 32, bw, 8)
    if (row.progress !== undefined) {
      ctx.fillStyle = rowGlow
      ctx.fillRect(36, y + 32, bw * clamp01(row.progress), 8)
    }
  })
  return toTexture(canvas)
}

/** Give a screen mesh a data-driven repaint hook. */
export function attachScreen(obj: THREE.Mesh, accent: number) {
  const mat = obj.material as THREE.MeshBasicMaterial
  obj.userData.setScreen = (kind: string, data: ScreenData) => {
    const sig = `${kind}|${JSON.stringify(data)}`
    if (obj.userData.screenSig === sig) return
    obj.userData.screenSig = sig
    const tex = liveScreenTexture(kind, data, accent)
    mat.map?.dispose()
    mat.map = tex
    mat.needsUpdate = true
  }
}

/** Big wall-mounted mission display. */
export function MissionDisplay(
  ctx: PropCtx,
  name: string,
  x: number,
  z: number,
  ry: number,
  accent: AccentName,
  w = 9,
  h = 4.6,
) {
  const color = ACCENT[accent]
  ctx.batch.at(rbox(w + 0.7, h + 0.7, 0.5, 0.14), M.dark, x, h / 2 + 1.6, z, ry)
  ctx.batch.at(box(w, h, 0.16), M.black, x, h / 2 + 1.6, z, ry)
  const [sx, sz] = local(x, z, ry, 0, 0.16)
  const scr = new THREE.Mesh(
    plane(w - 0.4, h - 0.4),
    new THREE.MeshBasicMaterial({ map: screenTexture(color, 7, 'graph') }),
  )
  scr.position.set(sx, h / 2 + 1.6, sz)
  scr.rotation.y = ry
  attachScreen(scr, color)
  ctx.register(name, scr)
  ctx.batch.at(box(w * 0.5, 0.12, 0.2), M.glow(color, 1.1), x, 1.5, sz, ry)
}

/** Holographic mission board floating in a room — the project's live state. */
export function HoloBoard(
  ctx: PropCtx,
  name: string,
  x: number,
  y: number,
  z: number,
  ry: number,
  accent: AccentName = 'cyan',
  w = 6.4,
  h = 3.6,
) {
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.rotation.y = ry
  const color = ACCENT[accent]
  const panel = new THREE.Mesh(plane(w, h), M.holo(color, 0.16))
  const frame = new THREE.Mesh(plane(w, h), M.holo(color, 0.4))
  frame.position.z = -0.01
  group.add(panel, frame)
  const bars: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const bar = new THREE.Mesh(plane(w * 0.5, 0.16), M.holo(color, 0.7))
    bar.position.set(-w * 0.16, h * 0.3 - i * 0.44, 0.01)
    group.add(bar)
    bars.push(bar)
  }
  const title = new THREE.Mesh(
    plane(w * 0.42, w * 0.42 * 0.24),
    new THREE.MeshBasicMaterial({
      map: plateTexture('MISSION', ''),
      transparent: true,
      opacity: 0.85,
    }),
  )
  title.position.set(-w * 0.25, h * 0.5 - 0.4, 0.01)
  group.add(title)
  group.userData.bars = bars
  group.userData.titleMesh = title
  /** Re-label the board — projects claim their module at runtime. */
  group.userData.setTitle = (text: string, sub = '') => {
    const mat = title.material as THREE.MeshBasicMaterial
    mat.map?.dispose()
    mat.map = plateTexture(text, sub)
    mat.needsUpdate = true
  }
  /** 0..1 completion, drawn as a growing bar stack. */
  group.userData.setProgress = (p: number, accentColor?: number) => {
    const filled = Math.round(clamp01(p) * bars.length)
    bars.forEach((bar, i) => {
      const mat = bar.material as THREE.MeshBasicMaterial
      if (accentColor) mat.color.setHex(accentColor)
      mat.opacity = i < filled ? 0.9 : 0.22
      bar.scale.x = i === filled ? 0.35 : 1
      bar.position.x = -w * 0.16 - (1 - bar.scale.x) * w * 0.25
    })
  }
  group.userData.setProgress(0.06)
  ctx.register(name, group)
  return group
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function StorageContainer(ctx: PropCtx, x: number, z: number, ry = 0, h = 2.4) {
  const w = h * 1.45
  const d = h * 1.25
  ctx.batch.at(rbox(w, h, d, 0.16), M.hullSoft, x, h / 2, z, ry)
  ctx.batch.at(rbox(w * 0.86, h * 0.62, d + 0.06, 0.1), M.hullDeep, x, h * 0.52, z, ry)
  ctx.batch.at(box(w * 0.5, 0.14, d + 0.1), M.dark, x, h * 0.86, z, ry)
  for (const s of [-1, 1]) {
    const [px, pz] = local(x, z, ry, s * w * 0.36, d / 2 + 0.04)
    ctx.batch.at(box(0.18, 0.5, 0.1), M.steel, px, h * 0.5, pz, ry)
  }
  const [lx, lz] = local(x, z, ry, 0, d / 2 + 0.06)
  ctx.batch.at(box(w * 0.3, 0.1, 0.06), M.glow(C.cyan, 1.0), lx, h * 0.72, lz, ry)
  solidBox(ctx, x, z, w + 0.2, d + 0.2)
}

export function ServerCabinet(
  ctx: PropCtx,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'green',
) {
  const color = ACCENT[accent]
  const w = 2.2
  const h = 5.2
  const d = 1.5
  ctx.batch.at(rbox(w, h, d, 0.14), M.hull, x, h / 2, z, ry)
  // glass door
  const [gx, gz] = local(x, z, ry, 0, d / 2 + 0.02)
  ctx.batch.at(box(w - 0.34, h - 1.0, 0.1), M.glass, gx, h / 2 + 0.1, gz, ry)
  // rack units
  const units = 9
  for (let i = 0; i < units; i++) {
    const y = 0.75 + i * (h - 1.6) / units
    const [ux, uz] = local(x, z, ry, 0, d / 2 - 0.12)
    ctx.batch.at(box(w - 0.5, (h - 1.6) / units * 0.72, 0.5), M.darker, ux, y, uz, ry)
    ctx.batch.at(box(0.1, 0.09, 0.06), M.glow(i % 3 === 0 ? C.cyan : color, 1.5), ux + (w - 1) * 0.3, y, uz + 0.1)
    ctx.batch.at(box(0.1, 0.09, 0.06), M.glow(color, 1.0), ux + (w - 1) * 0.42, y, uz + 0.1)
  }
  ctx.batch.at(rbox(w + 0.2, 0.3, d + 0.2, 0.06), M.dark, x, h + 0.1, z, ry)
  ctx.batch.at(box(w * 0.7, 0.1, 0.08), M.glow(color, 1.2), x, h - 0.35, z + (d / 2 + 0.06) * Math.cos(ry), ry)
  solidBox(ctx, x, z, w + 0.3, d + 0.3)
}

export function Workbench(ctx: PropCtx, x: number, z: number, ry: number) {
  const w = 5.2
  const d = 2.2
  ctx.batch.at(rbox(w, 0.22, d, 0.08), M.hullSoft, x, 1.6, z, ry)
  ctx.batch.at(box(w - 0.4, 0.9, d - 0.35), M.hull, x, 1.05, z, ry)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 0.9]) {
      const [px, pz] = local(x, z, ry, sx * (w / 2 - 0.4), sz * (d / 2 - 0.35))
      ctx.batch.at(box(0.26, 0.95, 0.26), M.dark, px, 0.48, pz, ry)
    }
  }
  // drawer bank
  const [dx, dz] = local(x, z, ry, w / 2 - 0.9, 0)
  for (let i = 0; i < 3; i++) {
    ctx.batch.at(box(1.5, 0.36, d - 0.4), M.hullDeep, dx, 0.5 + i * 0.42, dz, ry)
    ctx.batch.at(box(0.5, 0.08, 0.1), M.steel, dx + 0.5 * Math.cos(ry), 0.5 + i * 0.42, dz + 0.5, ry)
  }
  // tool board on the wall behind
  const [tx, tz] = local(x, z, ry, 0, -d / 2 - 0.4)
  ctx.batch.at(box(w * 0.8, 2.0, 0.16), M.hullDeep, tx, 3.4, tz, ry)
  for (let i = 0; i < 7; i++) {
    const [hx, hz] = local(tx, tz, ry, -w * 0.34 + i * 0.52, 0.16)
    ctx.batch.at(box(0.1, 0.7 + (i % 3) * 0.28, 0.08), M.steel, hx, 3.5, hz, ry)
  }
  // small parts tray + lamp arm
  const [px, pz] = local(x, z, ry, -w / 2 + 1.1, 0)
  ctx.batch.at(box(1.0, 0.14, 0.9), M.dark, px, 1.78, pz, ry)
  ctx.batch.at(cyl(0.06, 0.06, 2.2, 8), M.steel, x, 2.7, z, ry)
  ctx.batch.at(sph(0.22), M.glow(C.warmWhite, 1.4), x, 3.8, z)
  solidBox(ctx, x, z, w + 0.4, d + 0.4)
}

/** Robotic arm used in the workshop. */
export function RoboticArm(ctx: PropCtx, x: number, z: number, ry: number, accent: AccentName = 'cyan') {
  const color = ACCENT[accent]
  ctx.batch.at(cyl(1.0, 1.2, 0.5, 18), M.dark, x, 0.25, z)
  ctx.batch.at(rbox(0.7, 1.9, 0.7, 0.12), M.hull, x, 1.4, z, ry)
  ctx.batch.at(box(0.4, 0.5, 0.4), M.steel, x, 2.4, z, ry)
  const [a1x, a1z] = local(x, z, ry, 0.9, 0)
  ctx.batch.at(rbox(2.2, 0.34, 0.34, 0.1), M.hullSoft, a1x, 3.0, a1z, ry, 0, -0.55)
  const [a2x, a2z] = local(x, z, ry, 2.0, 0)
  ctx.batch.at(rbox(1.8, 0.26, 0.26, 0.08), M.hullSoft, a2x, 3.6, a2z, ry, 0, 0.5)
  const [hx, hz] = local(x, z, ry, 2.8, 0)
  ctx.batch.at(box(0.5, 0.4, 0.5), M.dark, hx, 3.2, hz, ry)
  ctx.batch.at(box(0.2, 0.1, 0.2), M.glow(color, 1.3), hx, 3.0, hz)
  solidCircle(ctx, x, z, 1.4)
}

/** Charging post worker robots park under. */
export function ChargingStation(
  ctx: PropCtx,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'cyan',
  id = `${x}-${z}`,
) {
  const color = ACCENT[accent]
  ctx.batch.at(rbox(2.6, 0.3, 2.6, 0.1), M.hullSoft, x, 0.15, z, ry)
  ctx.batch.at(box(2.0, 0.06, 2.0), M.floorPanel, x, 0.32, z, ry)
  const [px, pz] = local(x, z, ry, 0, -1.4)
  ctx.batch.at(rbox(0.5, 5.6, 0.6, 0.12), M.hull, px, 2.8, pz, ry)
  ctx.batch.at(box(0.16, 4.4, 0.14), M.glow(color, 1.0), px, 3.0, pz, ry)
  ctx.batch.at(box(0.7, 0.5, 0.9), M.dark, px, 5.2, pz, ry)
  const [cx2, cz2] = local(px, pz, ry, 0, 0.7)
  ctx.batch.at(cyl(0.06, 0.06, 1.2, 8), M.rubber, cx2, 4.6, cz2, 0, 0.4)
  ctx.batch.at(tube(0.24, 0.06), M.glow(color, 1.3), x, 0.42, z)
  // animated halo ring — its own material, so an occupied pad can brighten it
  const haloMat = M.glow(color, 1.4).clone()
  const ring = new THREE.Mesh(tube(1.05, 0.05, 24), haloMat)
  ring.rotation.x = -Math.PI / 2
  const holder = new THREE.Group()
  holder.position.set(x, 0.4, z)
  holder.add(ring)
  holder.userData.spin = 0.9
  holder.userData.pad = { x, z }
  holder.userData.halo = haloMat
  holder.userData.charge = 0
  ctx.register(`charge:${id}`, holder)
  solidCircle(ctx, x, z, 1.9)
}

/** Docking bay: a guide rail, a clamp and a status pylon. */
export function DockingStation(
  ctx: PropCtx,
  id: string,
  roomId: string,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'cyan',
  anchorKind: 'dock' | 'home' | 'park' | 'berth' = 'dock',
) {
  const color = ACCENT[accent]
  const axisX = Math.abs(Math.sin(ry)) > 0.5
  ctx.batch.at(rbox(3.4, 0.16, 3.4, 0.06), M.hullSoft, x, 0.08, z, ry)
  ctx.batch.at(box(2.6, 0.06, 2.6), M.floorPanel, x, 0.18, z, ry)
  for (const s of [-1, 1]) {
    const [px, pz] = local(x, z, ry, s * 1.5, 0)
    ctx.batch.at(box(axisX ? 0.18 : 3.0, 0.3, axisX ? 3.0 : 0.18), M.dark, px, 0.16, pz, ry)
  }
  const [pyx, pyz] = local(x, z, ry, 0, -1.5)
  ctx.batch.at(cyl(0.34, 0.4, 4.6, 12), M.hull, pyx, 2.3, pyz)
  ctx.batch.at(rbox(0.9, 0.7, 0.6, 0.1), M.dark, pyx, 4.5, pyz, ry)
  const lamp = new THREE.Mesh(sph(0.2), M.glow(color, 1.8))
  lamp.position.set(pyx, 4.95, pyz)
  ctx.register(`docklamp:${id}`, lamp)
  ctx.batch.at(box(0.1, 0.1, 0.6), M.glow(C.cyan, 0.9), pyx, 5.2, pyz)
  anchor(ctx, `dock:${id}`, roomId, anchorKind, x, z, [Math.sin(ry + Math.PI), Math.cos(ry + Math.PI)])
  solidCircle(ctx, x, z, 1.2)
}

/** Robot maintenance berth in the workshop. */
export function MaintenanceBerth(
  ctx: PropCtx,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'cyan',
) {
  const color = ACCENT[accent]
  ctx.batch.at(rbox(4.4, 0.5, 3.0, 0.14), M.hullSoft, x, 0.25, z, ry)
  ctx.batch.at(box(3.6, 0.12, 2.2), M.dark, x, 0.54, z, ry)
  for (const s of [-1, 1]) {
    const [px, pz] = local(x, z, ry, s * 1.9, 0)
    ctx.batch.at(cyl(0.16, 0.16, 3.2, 10), M.steel, px, 1.8, pz)
  }
  ctx.batch.at(rbox(4.6, 0.3, 0.5, 0.08), M.hull, x, 3.4, z, ry)
  ctx.batch.at(box(3.0, 0.1, 0.1), M.glow(color, 1.2), x, 3.2, z, ry)
  solidBox(ctx, x, z, 4.6, 3.2)
}

/** Wall mechanical panel: pipes, valves, gauges. */
export function MechanicalPanel(
  ctx: PropCtx,
  name: string,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'cyan',
) {
  const color = ACCENT[accent]
  ctx.batch.at(box(3.6, 3.4, 0.22), M.hullDeep, x, 3.4, z, ry)
  ctx.batch.at(box(3.2, 0.16, 0.26), M.dark, x, 2.2, z, ry)
  ctx.batch.at(box(3.2, 0.16, 0.26), M.dark, x, 4.6, z, ry)
  for (let i = 0; i < 3; i++) {
    const [px, pz] = local(x, z, ry, -1.1 + i * 1.1, 0.16)
    ctx.batch.at(cyl(0.3, 0.3, 2.6, 12), M.steel, px, 3.4, pz, 0, 0, Math.PI / 2)
    ctx.batch.at(tube(0.34, 0.07), M.dark, px, 3.4, pz + 0.1 * Math.cos(ry), ry + Math.PI / 2)
  }
  ctx.batch.at(cyl(0.42, 0.42, 0.18, 16), M.dark, x + 0.9 * Math.cos(ry), 5.2, z - 0.9 * Math.sin(ry), Math.PI / 2)
  ctx.batch.at(cyl(0.3, 0.3, 0.06, 16), M.glow(color, 1.1), x + 0.9 * Math.cos(ry), 5.2, z - 0.9 * Math.sin(ry), Math.PI / 2)
}

/** Slanted control console with knobs and a readout. */
export function ControlPanel(
  ctx: PropCtx,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'cyan',
) {
  const color = ACCENT[accent]
  ctx.batch.at(rbox(3.0, 1.0, 1.4, 0.12), M.hull, x, 0.5, z, ry)
  ctx.batch.at(rbox(3.0, 0.16, 1.5, 0.08), M.hullSoft, x, 1.1, z, ry, -0.35)
  const [sx, sz] = local(x, z, ry, 0, 0.05)
  ctx.batch.at(box(1.1, 0.06, 0.55), M.glow(color, 0.7), sx, 1.16, sz, ry, -0.35)
  for (let i = 0; i < 5; i++) {
    const [kx, kz] = local(x, z, ry, -1.2 + i * 0.6, 0.45)
    ctx.batch.at(cyl(0.13, 0.13, 0.14, 10), M.dark, kx, 1.18, kz, 0, -0.35)
  }
  solidBox(ctx, x, z, 3.2, 1.6)
}

/** Communications terminal: dish + screen. */
export function CommunicationTerminal(ctx: PropCtx, x: number, z: number, ry: number) {
  ctx.batch.at(cyl(0.3, 0.4, 2.4, 12), M.steel, x, 1.2, z)
  ctx.batch.at(sph(0.42), M.hull, x, 2.5, z)
  const dish = new THREE.Group()
  dish.position.set(x, 2.5, z)
  const d = new THREE.Mesh(cyl(1.2, 0.12, 0.4, 20, true), M.hullSoft)
  d.rotation.z = Math.PI / 2
  dish.add(d)
  const feed = new THREE.Mesh(cyl(0.06, 0.06, 1.0, 8), M.dark)
  feed.position.set(0.5, 0, 0)
  feed.rotation.z = Math.PI / 2
  dish.add(feed)
  const tip = new THREE.Mesh(sph(0.13), M.glow(C.cyan, 1.6))
  tip.position.set(1.0, 0, 0)
  dish.add(tip)
  dish.rotation.z = -0.5
  dish.rotation.y = ry
  ctx.register(`comm:${x.toFixed(1)}:${z.toFixed(1)}`, dish)
  ctx.batch.at(rbox(1.6, 1.2, 0.3, 0.08), M.dark, x, 1.6, z + 0.9 * Math.cos(ry), ry)
  ctx.batch.at(box(1.3, 0.9, 0.06), M.glow(C.cyanDeep, 0.6), x, 1.6, z + 0.9 * Math.cos(ry) + 0.16, ry)
  solidCircle(ctx, x, z, 0.8)
}

/** Rotating warning beacon. */
export function WarningLight(
  ctx: PropCtx,
  name: string,
  x: number,
  y: number,
  z: number,
  color = C.red,
) {
  ctx.batch.at(cyl(0.42, 0.5, 0.2, 14), M.dark, x, y, z)
  const beacon = new THREE.Mesh(cyl(0.28, 0.34, 0.7, 14), M.glow(color, 1.8))
  beacon.position.set(x, y + 0.45, z)
  const holder = new THREE.Group()
  holder.position.set(x, y, z)
  holder.add(beacon)
  beacon.position.set(0, 0.45, 0)
  const cap = new THREE.Mesh(sph(0.3), M.glow(color, 1.4))
  cap.position.set(0, 0.85, 0)
  holder.add(cap)
  holder.userData.beacon = beacon
  ctx.register(name, holder)
  return holder
}

/** Vertical status pylon: a glowing column that reports room state. */
export function StatusPylon(
  ctx: PropCtx,
  name: string,
  x: number,
  z: number,
  accent: AccentName = 'cyan',
) {
  const color = ACCENT[accent]
  ctx.batch.at(rbox(0.9, 0.9, 0.9, 0.14), M.dark, x, 0.45, z)
  ctx.batch.at(cyl(0.22, 0.26, 3.6, 12), M.hull, x, 2.4, z)
  const core = new THREE.Mesh(cyl(0.14, 0.14, 3.0, 10), M.glow(color, 0.85))
  core.position.set(x, 2.5, z)
  ctx.batch.at(sph(0.3), M.glow(color, 0.55), x, 4.2, z)
  ctx.register(name, core)
  solidCircle(ctx, x, z, 0.7)
  return core
}

/** Potted plant — the reference sheets put greenery in every room. */
export function Plant(ctx: PropCtx, x: number, z: number, scale = 1) {
  const pot = cyl(0.55 * scale, 0.42 * scale, 0.7 * scale, 16)
  ctx.batch.at(pot, M.hullSoft, x, 0.35 * scale, z)
  ctx.batch.at(box(1.5 * scale, 0.3 * scale, 1.5 * scale), M.hullDeep, x, 0.78 * scale, z)
  const rng = ctx.rng
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2
    const r = 0.5 * scale * rng()
    const h = 1.1 * scale + rng() * 0.9 * scale
    ctx.batch.at(
      plane(0.5 * scale, h),
      i % 2 ? M.leaf : M.leafDark,
      x + Math.cos(a) * r,
      0.8 * scale + h / 2,
      z + Math.sin(a) * r,
      a,
      0,
      (rng() - 0.5) * 0.7,
      scale,
    )
  }
  solidCircle(ctx, x, z, 0.8 * scale)
}

/** Wrapped cable running along a floor or wall. */
export function Cable(
  ctx: PropCtx,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y = 0.14,
  color = C.rubber,
) {
  const dx = x1 - x0
  const dz = z1 - z0
  const len = Math.hypot(dx, dz)
  const ry = Math.atan2(dx, dz)
  ctx.batch.at(
    cyl(0.09, 0.09, len, 8),
    color === C.rubber ? M.rubber : M.dark,
    (x0 + x1) / 2,
    y,
    (z0 + z1) / 2,
    0,
    Math.PI / 2,
    ry + Math.PI / 2,
  )
}

/** Inactive robot shells stacked in the workshop. */
export function SpareRobotParts(ctx: PropCtx, x: number, z: number, ry: number) {
  ctx.batch.at(rbox(2.0, 0.7, 1.6, 0.2), M.hullSoft, x, 0.35, z, ry)
  ctx.batch.at(cyl(0.5, 0.5, 1.5, 16), M.hull, x, 1.2, z + 0.3, ry, 0, Math.PI / 2)
  ctx.batch.at(cyl(0.34, 0.34, 0.5, 16), M.dark, x + 0.7, 1.2, z + 0.3, 0, 0, Math.PI / 2)
  ctx.batch.at(cyl(0.34, 0.34, 0.5, 16), M.dark, x - 0.7, 1.2, z + 0.3, 0, 0, Math.PI / 2)
  solidBox(ctx, x, z, 2.2, 2.0)
}

/** Simulation chamber in the test lab. */
export function SimulationChamber(
  ctx: PropCtx,
  name: string,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'red',
) {
  const color = ACCENT[accent]
  ctx.batch.at(rbox(5.0, 5.6, 4.2, 0.24), M.hull, x, 2.8, z, ry)
  ctx.batch.at(box(3.6, 4.2, 3.4), M.black, x, 2.8, z, ry)
  const [gx, gz] = local(x, z, ry, 0, 2.1)
  ctx.batch.at(box(3.6, 4.2, 0.1), M.glass, gx, 2.8, gz, ry)
  ctx.batch.at(box(3.9, 0.16, 0.16), M.glow(color, 1.3), x, 5.3, gz, ry)
  ctx.batch.at(rbox(5.4, 0.4, 4.6, 0.1), M.dark, x, 5.7, z, ry)
  const roller = new THREE.Mesh(cyl(0.9, 0.9, 3.0, 18), M.glow(color, 0.8))
  roller.rotation.z = Math.PI / 2
  roller.position.set(x, 1.4, z)
  ctx.register(name, roller)
  solidBox(ctx, x, z, 5.4, 4.6)
}

/** Review board: a wall of documents with a big approval ring. */
export function ReviewBoard(
  ctx: PropCtx,
  name: string,
  x: number,
  z: number,
  ry: number,
  accent: AccentName = 'gold',
) {
  const color = ACCENT[accent]
  ctx.batch.at(rbox(8.4, 4.6, 0.36, 0.12), M.dark, x, 3.6, z, ry)
  ctx.batch.at(box(8.0, 4.2, 0.16), M.black, x, 3.6, z, ry)
  const scr = new THREE.Mesh(
    plane(7.6, 3.8),
    new THREE.MeshBasicMaterial({ map: screenTexture(color, 3, 'status') }),
  )
  const [sx, sz] = local(x, z, ry, 0, 0.16)
  scr.position.set(sx, 3.6, sz)
  scr.rotation.y = ry
  ctx.register(name, scr)
  for (let i = 0; i < 4; i++) {
    const [px, pz] = local(x, z, ry, -3.0 + i * 2.0, 0.3)
    const doc = new THREE.Mesh(plane(1.5, 2.0), M.holo(color, 0.25))
    doc.position.set(px, 3.0 - (i % 2) * 0.5, pz)
    doc.rotation.y = ry
    ctx.register(`${name}:doc${i}`, doc)
  }
}

/** Interface hologram used in the frontend lab. */
export function InterfaceHologram(
  ctx: PropCtx,
  name: string,
  x: number,
  y: number,
  z: number,
  ry: number,
  accent: AccentName = 'blue',
) {
  const color = ACCENT[accent]
  const group = new THREE.Group()
  group.position.set(x, y, z)
  group.rotation.y = ry
  const frame = new THREE.Mesh(plane(4.6, 3.0), M.holo(color, 0.13))
  group.add(frame)
  const chrome = new THREE.Mesh(plane(4.6, 0.44), M.holo(color, 0.4))
  chrome.position.set(0, 1.28, 0.01)
  group.add(chrome)
  for (let i = 0; i < 4; i++) {
    const card = new THREE.Mesh(plane(1.1, 0.9), M.holo(color, 0.32))
    card.position.set(-1.6 + i * 1.1, -0.35, 0.02)
    group.add(card)
  }
  const side = new THREE.Mesh(plane(1.8, 1.4), M.holo(color, 0.2))
  side.position.set(2.9, 0, -1.6)
  side.rotation.y = -0.7
  group.add(side)
  ctx.register(name, group)
  return group
}

/** Project signage over a module doorway. */
export function ProjectSign(
  ctx: PropCtx,
  name: string,
  title: string,
  subtitle: string,
  x: number,
  y: number,
  z: number,
  ry: number,
  accent: AccentName = 'cyan',
) {
  const color = ACCENT[accent]
  ctx.batch.at(rbox(6.4, 2.2, 0.3, 0.1), M.darker, x, y, z, ry)
  const sign = new THREE.Mesh(
    plane(6.0, 1.9),
    new THREE.MeshBasicMaterial({ map: signTexture(title, subtitle, color) }),
  )
  const [sx, sz] = local(x, z, ry, 0, 0.18)
  sign.position.set(sx, y, sz)
  sign.rotation.y = ry
  ctx.register(name, sign)
  return sign
}

/** Role badge plate carried by a worker robot. */
export function rolePlateTexture(kind: 'gear' | 'code' | 'check' | 'flask', color: number) {
  return roleIconTexture(kind, color)
}
