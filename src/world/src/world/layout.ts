import type { AccentName } from '../core/palette'

/**
 * SHIP LAYOUT — one connected spaceship, defined as data.
 *
 *                    MISSION CONTROL          (z = -124)
 *                          |
 *                    TEAM MATE HQ             (z =  -58)   round rotunda
 *                          |
 *   PROJECT 01 ────── PROJECT DECK ────── PROJECT 02        (z =  -12)
 *                          |
 *   PROJECT 03 ─────────── spine ───────── BACKEND LAB      (z =   18)
 *                          |
 *   FRONTEND LAB ─────────────────────────  REVIEW LAB      (z =   48)
 *                          |
 *   TEST LAB ─────────────────────────────  WORKSHOP        (z =   78)
 *                          |
 *   EXPANSION A ──────────────────────────  EXPANSION B     (z =  108)
 *                          |
 *                     ROBOT DOCK             (z =  150)
 *                          |
 *                     COMMAND DECK           (z =  226)      round, player spawn
 *
 * Everything hangs off one straight spine corridor, so the ship reads as a
 * single place you can walk end to end. North is -Z; the ship points north.
 */

export type RoomKind =
  | 'command'
  | 'hq'
  | 'project'
  | 'agent'
  | 'workshop'
  | 'mission'
  | 'dock'
  | 'archive'
  | 'expansion'

export type AgentRole = 'backend' | 'frontend' | 'review' | 'test'

export interface DoorDef {
  /** Which wall of the room the doorway sits on. */
  side: 'N' | 'S' | 'E' | 'W'
  /** Offset along that wall from the room centre. */
  at: number
  width: number
  /** Automatic sliding door vs. open archway. */
  auto?: boolean
}

export interface RoomDef {
  id: string
  name: string
  kind: RoomKind
  shape: 'rect' | 'round'
  /** [x, z] on the deck plane. */
  center: [number, number]
  /** rect: [width, depth]. round: [radius, radius]. */
  size: [number, number]
  height: number
  accent: AccentName
  role?: AgentRole
  /** Small dark signage above the doorway. */
  sign?: [string, string]
  doors: DoorDef[]
  /** Rooms start dark and come alive when the simulation uses them. */
  dormant?: boolean
}

export interface CorridorDef {
  id: string
  center: [number, number]
  size: [number, number]
  height: number
  /** Geometry for this corridor is built by the spine/hall builder instead. */
  logicOnly?: boolean
  /** Skip the inset so the rect can join a room without a seam. */
  pad?: number
}

export const SPINE_WIDTH = 8
export const SPINE_HALF = SPINE_WIDTH / 2

export const ROOM_H = 7.5
export const BAND_DEPTH = 26
export const BAND_PITCH = 30
const BAND_Z0 = -12

export function bandZ(n: number) {
  return BAND_Z0 + n * BAND_PITCH
}

export const WEST_X = -24
export const EAST_X = 24
export const ROOM_W = 34

// --- the two round rotundas and the dock sit on the spine -------------------
export const HQ_CENTER = -58
export const HQ_RADIUS = 17
export const MISSION_CENTER = -124
export const MISSION_RADIUS = 19
export const COMMAND_CENTER = 226
export const COMMAND_RADIUS = 24
export const DOCK_CENTER = 150
export const DOCK_SIZE = 56
export const DOCK_DEPTH = 30
export const ARCHIVE_CENTER: [number, number] = [-46, -124]
export const ARCHIVE_RADIUS = 13

/** Where the spine's side walls have to stop so they don't pierce a rotunda. */
const shellChord = (radius: number, centerZ: number, north: boolean) =>
  centerZ + (north ? -1 : 1) * Math.sqrt(radius * radius - SPINE_HALF * SPINE_HALF)

/** The second project-deck band, north of Mission Control (W-01, option b). */
export const DECK_B_BANDS = [-160, -190, -220]
export const DECK_B_NORTH = -240

export const SPINE_SEGMENTS = [
  // the second project deck, north of Mission Control
  { z0: DECK_B_NORTH, z1: shellChord(MISSION_RADIUS, MISSION_CENTER, true) },
  // from Mission Control's south doorway up to the HQ rotunda
  { z0: shellChord(MISSION_RADIUS, MISSION_CENTER, false), z1: shellChord(HQ_RADIUS, HQ_CENTER, true) },
  { z0: shellChord(HQ_RADIUS, HQ_CENTER, false), z1: DOCK_CENTER - DOCK_DEPTH / 2 },
  { z0: DOCK_CENTER + DOCK_DEPTH / 2, z1: shellChord(COMMAND_RADIUS, COMMAND_CENTER, true) },
]

export const ROOMS: RoomDef[] = [
  {
    id: 'command',
    name: 'COMMAND DECK',
    kind: 'command',
    shape: 'round',
    center: [0, COMMAND_CENTER],
    size: [COMMAND_RADIUS, COMMAND_RADIUS],
    height: 11,
    accent: 'cyan',
    sign: ['DECK 06', 'COMMAND DECK'],
    doors: [{ side: 'N', at: 0, width: 12 }],
  },
  {
    id: 'dock',
    name: 'ROBOT DOCK',
    kind: 'dock',
    shape: 'rect',
    center: [0, DOCK_CENTER],
    size: [DOCK_SIZE, DOCK_DEPTH],
    height: 8.5,
    accent: 'cyan',
    sign: ['BAY 05', 'ROBOT DOCK'],
    doors: [
      { side: 'N', at: 0, width: 12 },
      { side: 'S', at: 0, width: 12 },
    ],
  },
  {
    id: 'workshop',
    name: 'WORKSHOP',
    kind: 'workshop',
    shape: 'rect',
    center: [EAST_X, bandZ(3)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'cyan',
    sign: ['LAB 04', 'WORKSHOP'],
    doors: [{ side: 'W', at: 0, width: 8, auto: true }],
  },
  {
    id: 'test',
    name: 'TEST LAB',
    kind: 'agent',
    role: 'test',
    shape: 'rect',
    center: [WEST_X, bandZ(3)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'red',
    sign: ['LAB 03', 'TEST LAB'],
    doors: [{ side: 'E', at: 0, width: 8, auto: true }],
  },
  {
    id: 'review',
    name: 'REVIEW LAB',
    kind: 'agent',
    role: 'review',
    shape: 'rect',
    center: [EAST_X, bandZ(2)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'gold',
    sign: ['LAB 02', 'REVIEW LAB'],
    doors: [{ side: 'W', at: 0, width: 8, auto: true }],
  },
  {
    id: 'frontend',
    name: 'FRONTEND LAB',
    kind: 'agent',
    role: 'frontend',
    shape: 'rect',
    center: [WEST_X, bandZ(2)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'blue',
    sign: ['LAB 01', 'FRONTEND LAB'],
    doors: [{ side: 'E', at: 0, width: 8, auto: true }],
  },
  {
    id: 'backend',
    name: 'BACKEND LAB',
    kind: 'agent',
    role: 'backend',
    shape: 'rect',
    center: [EAST_X, bandZ(1)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'green',
    sign: ['LAB 00', 'BACKEND LAB'],
    doors: [{ side: 'W', at: 0, width: 8, auto: true }],
  },
  {
    id: 'expansion-b',
    name: 'EXPANSION BAY B',
    kind: 'expansion',
    shape: 'rect',
    center: [EAST_X, bandZ(4)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'cyan',
    sign: ['SLOT B', 'EXPANSION'],
    doors: [{ side: 'W', at: 0, width: 8, auto: true }],
    dormant: true,
  },
  {
    id: 'expansion-a',
    name: 'EXPANSION BAY A',
    kind: 'expansion',
    shape: 'rect',
    center: [WEST_X, bandZ(4)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'cyan',
    sign: ['SLOT A', 'EXPANSION'],
    doors: [{ side: 'E', at: 0, width: 8, auto: true }],
    dormant: true,
  },
  // --- the second project-deck band (W-01, option b) ----------------------
  ...deckBModules(),
  // --- the three seed projects -------------------------------------------
  {
    id: 'project-1',
    name: 'PROJECT 01',
    kind: 'project',
    shape: 'rect',
    center: [WEST_X, bandZ(0)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'cyan',
    sign: ['PROJECT 01', 'E-COMMERCE'],
    doors: [{ side: 'E', at: 0, width: 9, auto: true }],
    dormant: true,
  },
  {
    id: 'project-2',
    name: 'PROJECT 02',
    kind: 'project',
    shape: 'rect',
    center: [EAST_X, bandZ(0)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'cyan',
    sign: ['PROJECT 02', 'MOBILE APP'],
    doors: [{ side: 'W', at: 0, width: 9, auto: true }],
    dormant: true,
  },
  {
    id: 'project-3',
    name: 'PROJECT 03',
    kind: 'project',
    shape: 'rect',
    center: [WEST_X, bandZ(1)],
    size: [ROOM_W, BAND_DEPTH],
    height: ROOM_H,
    accent: 'cyan',
    sign: ['PROJECT 03', 'INFRASTRUCTURE'],
    doors: [{ side: 'E', at: 0, width: 9, auto: true }],
    dormant: true,
  },
  {
    id: 'hq',
    name: 'TEAM MATE HQ',
    kind: 'hq',
    shape: 'round',
    center: [0, HQ_CENTER],
    size: [HQ_RADIUS, HQ_RADIUS],
    height: 12,
    accent: 'cyan',
    sign: ['DECK 03', 'TEAM MATE HQ'],
    doors: [
      { side: 'N', at: 0, width: 12 },
      { side: 'S', at: 0, width: 12 },
    ],
  },
  {
    id: 'mission',
    name: 'MISSION CONTROL',
    kind: 'mission',
    shape: 'round',
    center: [0, MISSION_CENTER],
    size: [MISSION_RADIUS, MISSION_RADIUS],
    height: 11,
    accent: 'cyan',
    sign: ['DECK 04', 'MISSION CONTROL'],
    doors: [
      { side: 'S', at: 0, width: 10, auto: true },
      { side: 'W', at: 0, width: 7, auto: true },
    ],
  },
  {
    id: 'archive',
    name: 'COMPLETED MISSIONS',
    kind: 'archive',
    shape: 'round',
    center: ARCHIVE_CENTER,
    size: [ARCHIVE_RADIUS, ARCHIVE_RADIUS],
    height: 8,
    accent: 'gold',
    sign: ['DECK 04', 'MISSION ARCHIVE'],
    doors: [{ side: 'E', at: 0, width: 7 }],
  },
]

/**
 * The second project-deck band. Six module rooms run north of Mission Control
 * so the deck can hold more than five live projects. They are ordinary project
 * modules: dormant until a project claims them.
 */
function deckBModules(): RoomDef[] {
  const out: RoomDef[] = []
  DECK_B_BANDS.forEach((z, i) => {
    for (const side of [-1, 1] as const) {
      const west = side < 0
      const id = `project-b${i * 2 + (west ? 1 : 2)}`
      out.push({
        id,
        name: `PROJECT ${String(id).slice(-2).toUpperCase()}`,
        kind: 'project',
        shape: 'rect',
        center: [west ? WEST_X : EAST_X, z],
        size: [ROOM_W, BAND_DEPTH],
        height: ROOM_H,
        accent: 'cyan',
        sign: ['PROJECT DECK B', 'UNASSIGNED'],
        doors: [{ side: west ? 'E' : 'W', at: 0, width: 9, auto: true }],
        dormant: true,
      })
    }
  })
  return out
}

export const CORRIDORS: CorridorDef[] = [
  // Walkable logic for the spine (its walls are built as one continuous run).
  { id: 'spine-a', center: [0, -90], size: [SPINE_WIDTH, 34], height: 6.5, logicOnly: true },
  { id: 'spine-b', center: [0, -29], size: [SPINE_WIDTH, 30], height: 6.5, logicOnly: true },
  { id: 'spine-c', center: [0, 30], size: [SPINE_WIDTH, 130], height: 6.5, logicOnly: true },
  { id: 'spine-d', center: [0, 106], size: [SPINE_WIDTH, 62], height: 6.5, logicOnly: true },
  { id: 'spine-e', center: [0, 168], size: [SPINE_WIDTH, 40], height: 6.5, logicOnly: true },
  // archive access hall (east of the archive into mission control)
  { id: 'archive-hall', center: [-26, -124], size: [16, 8], height: 6, pad: 0.3 },
  // the second project-deck spine, north of Mission Control
  { id: 'spine-n', center: [0, -191], size: [SPINE_WIDTH, 98], height: 6.5, logicOnly: true },
  ...deckTunnels(),
]

/** Short connectors between the spine and every side room doorway. */
function deckTunnels(): CorridorDef[] {
  const out: CorridorDef[] = []
  const bands = [
    { z: bandZ(0), west: 'project-1', east: 'project-2' },
    { z: bandZ(1), west: 'project-3', east: 'backend' },
    { z: bandZ(2), west: 'frontend', east: 'review' },
    { z: bandZ(3), west: 'test', east: 'workshop' },
    { z: bandZ(4), west: 'expansion-a', east: 'expansion-b' },
    { z: -160, west: 'project-b1', east: 'project-b2' },
    { z: -190, west: 'project-b3', east: 'project-b4' },
    { z: -220, west: 'project-b5', east: 'project-b6' },
  ]
  for (const b of bands) {
    out.push({ id: `tunnel-w-${b.west}`, center: [-5.5, b.z], size: [7, 8], height: 6.5, pad: 0.2 })
    out.push({ id: `tunnel-e-${b.east}`, center: [5.5, b.z], size: [7, 8], height: 6.5, pad: 0.2 })
  }
  return out
}

export const roomById = (id: string) => ROOMS.find((r) => r.id === id)!

/** Walkable footprint of a room, inset from its walls by `pad`. */
export function roomBounds(r: RoomDef, pad = 0.9) {
  if (r.shape === 'round') {
    return { round: true as const, x: r.center[0], z: r.center[1], radius: r.size[0] - pad }
  }
  return {
    round: false as const,
    minX: r.center[0] - r.size[0] / 2 + pad,
    maxX: r.center[0] + r.size[0] / 2 - pad,
    minZ: r.center[1] - r.size[1] / 2 + pad,
    maxZ: r.center[1] + r.size[1] / 2 - pad,
  }
}

export function corridorBounds(c: CorridorDef, pad = 0.8) {
  const p = c.pad ?? pad
  return {
    minX: c.center[0] - c.size[0] / 2 + p,
    maxX: c.center[0] + c.size[0] / 2 - p,
    minZ: c.center[1] - c.size[1] / 2 + p,
    maxZ: c.center[1] + c.size[1] / 2 - p,
  }
}

/** Doorway world position + outward normal (pointing away from the room). */
export function doorFrame(r: RoomDef, d: DoorDef) {
  const [cx, cz] = r.center
  switch (d.side) {
    case 'N':
      return { x: cx + d.at, z: cz - r.size[1] / 2, nx: 0, nz: -1 }
    case 'S':
      return { x: cx + d.at, z: cz + r.size[1] / 2, nx: 0, nz: 1 }
    case 'W':
      return { x: cx - r.size[0] / 2, z: cz + d.at, nx: -1, nz: 0 }
    case 'E':
      return { x: cx + r.size[0] / 2, z: cz + d.at, nx: 1, nz: 0 }
  }
}

/**
 * Every place a project can live. The first five shipped installed; the second
 * deck band grows the pool past ten so the deck never refuses a project.
 */
export const MODULE_SLOTS = [
  'project-1',
  'project-2',
  'project-3',
  'expansion-a',
  'expansion-b',
  'project-b1',
  'project-b2',
  'project-b3',
  'project-b4',
  'project-b5',
  'project-b6',
]

export const ROLE_ROOM: Record<AgentRole, string> = {
  backend: 'backend',
  frontend: 'frontend',
  review: 'review',
  test: 'test',
}

export const ROLE_ACCENT: Record<AgentRole, AccentName> = {
  backend: 'green',
  frontend: 'blue',
  review: 'gold',
  test: 'red',
}
