import { CORRIDORS, ROOMS, doorFrame, roomBounds, corridorBounds, bandZ, type RoomDef } from './layout'
import { dist2, distSq2 } from '../core/math'

export interface NavNode {
  id: string
  x: number
  z: number
  links: string[]
  roomId?: string
}

/** A named place a robot or the player may want to stand: a workstation, a dock, a terminal. */
export interface Anchor {
  id: string
  roomId: string
  kind: string
  x: number
  z: number
  /** Facing direction so a robot can park looking at its workstation. */
  fx: number
  fz: number
  /** Agent id currently occupying it, if it is a single-occupancy spot. */
  busy?: string | null
}

/**
 * A* over a waypoint mesh derived from the layout plus the anchors the ship
 * builder registers while placing props. Small and exact: every route stays
 * inside walkable space, and no prop ever blocks a robot by accident.
 */
export class NavGraph {
  nodes = new Map<string, NavNode>()
  anchors = new Map<string, Anchor>()

  addNode(id: string, x: number, z: number, roomId?: string) {
    let n = this.nodes.get(id)
    if (!n) {
      n = { id, x, z, links: [], roomId }
      this.nodes.set(id, n)
    }
    return n
  }

  link(a: string, b: string) {
    const na = this.nodes.get(a)
    const nb = this.nodes.get(b)
    if (!na || !nb || na === nb) return
    if (!na.links.includes(b)) na.links.push(b)
    if (!nb.links.includes(a)) nb.links.push(a)
  }

  addAnchor(a: Anchor) {
    this.anchors.set(a.id, a)
    this.addNode(`a:${a.id}`, a.x, a.z, a.roomId)
  }

  anchor(id: string) {
    return this.anchors.get(id)
  }

  allAnchors(kind?: string) {
    const out: Anchor[] = []
    for (const a of this.anchors.values()) if (!kind || a.kind === kind) out.push(a)
    return out
  }

  /** First free anchor of a kind, preferring a room. */
  freeAnchor(kind: string, roomId?: string, occupant?: string) {
    let fallback: Anchor | undefined
    for (const a of this.anchors.values()) {
      if (a.kind !== kind) continue
      if (a.busy && a.busy !== occupant) continue
      if (roomId && a.roomId !== roomId) {
        fallback ??= a
        continue
      }
      return a
    }
    return fallback
  }

  closestNodeId(x: number, z: number, filter?: (n: NavNode) => boolean) {
    let best: NavNode | undefined
    let bestD = Infinity
    for (const n of this.nodes.values()) {
      if (filter && !filter(n)) continue
      const d = distSq2(x, z, n.x, n.z)
      if (d < bestD) {
        bestD = d
        best = n
      }
    }
    return best?.id
  }

  /** Node ids from the node nearest (x,z) to the node nearest the destination. */
  path(x: number, z: number, tx: number, tz: number): NavNode[] {
    const start = this.closestNodeId(x, z)
    const goal = this.closestNodeId(tx, tz)
    if (!start || !goal) return []
    return this.pathNodes(start, goal)
  }

  pathNodes(startId: string, goalId: string): NavNode[] {
    const startNode = this.nodes.get(startId)
    const goal = this.nodes.get(goalId)
    if (!startNode || !goal) return []
    if (startId === goalId) return [startNode]

    const open = new Set<string>([startId])
    const cameFrom = new Map<string, string>()
    const g = new Map<string, number>([[startId, 0]])
    const f = new Map<string, number>([
      [startId, dist2(startNode.x, startNode.z, goal.x, goal.z)],
    ])

    while (open.size) {
      let current = ''
      let bestF = Infinity
      for (const id of open) {
        const v = f.get(id) ?? Infinity
        if (v < bestF) {
          bestF = v
          current = id
        }
      }
      if (current === goalId) {
        const out: NavNode[] = []
        let cur: string | undefined = current
        while (cur) {
          out.push(this.nodes.get(cur)!)
          cur = cameFrom.get(cur)
        }
        return out.reverse()
      }
      open.delete(current)
      const node = this.nodes.get(current)!
      for (const linkId of node.links) {
        const nb = this.nodes.get(linkId)
        if (!nb) continue
        const tentative = (g.get(current) ?? Infinity) + dist2(node.x, node.z, nb.x, nb.z)
        if (tentative < (g.get(linkId) ?? Infinity)) {
          cameFrom.set(linkId, current)
          g.set(linkId, tentative)
          f.set(linkId, tentative + dist2(nb.x, nb.z, goal.x, goal.z))
          open.add(linkId)
        }
      }
    }
    return []
  }
}

// ---------------------------------------------------------------------------
// Building the graph from the layout
// ---------------------------------------------------------------------------

const ROTUNDA_MIN = -74.5
const ROTUNDA_MAX = -41.5

export function buildNav(): NavGraph {
  const nav = new NavGraph()

  // --- spine chain --------------------------------------------------------
  const chainZ = new Set<number>()
  for (let z = -105; z <= 203; z += 4.5) {
    if (z > ROTUNDA_MIN && z < ROTUNDA_MAX) continue
    chainZ.add(round2(z))
  }
  for (const n of [0, 1, 2, 3, 4]) chainZ.add(bandZ(n))
  for (const z of [-105, -104, -76, -40, 135, 165, 203]) chainZ.add(z)
  const chain = [...chainZ].sort((a, b) => a - b)
  chain.forEach((z, i) => {
    nav.addNode(spineId(z), 0, z)
    if (i > 0) nav.link(spineId(z), spineId(chain[i - 1]))
  })

  // --- team mate hq rotunda ----------------------------------------------
  const hq: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const id = `hq:${i}`
    nav.addNode(id, Math.sin(a) * 11.5, -58 + Math.cos(a) * 11.5, 'hq')
    hq.push(id)
    nav.link(id, hq[(i + 9) % 10])
  }
  nav.link('hq:5', spineId(nearChain(chain, -76)))
  nav.link('hq:0', spineId(nearChain(chain, -40)))

  // --- robot dock bays ----------------------------------------------------
  for (const z of [140, 150, 160]) {
    for (const s of [-1, 1]) {
      const id = `dockbay:${s > 0 ? 'e' : 'w'}${z}`
      nav.addNode(id, s * 20, z, 'dock')
      nav.link(id, spineId(nearChain(chain, z)))
    }
  }

  // --- command deck ring --------------------------------------------------
  const cmd: string[] = []
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const id = `cmd:${i}`
    nav.addNode(id, Math.sin(a) * 13, 226 + Math.cos(a) * 13, 'command')
    cmd.push(id)
    nav.link(id, cmd[(i + 11) % 12])
  }
  nav.link('cmd:6', spineId(nearChain(chain, 203)))

  // --- side rooms ---------------------------------------------------------
  for (const room of ROOMS) {
    if (room.kind === 'command' || room.kind === 'hq' || room.kind === 'dock') continue

    if (room.id === 'archive') {
      nav.addNode('archive:hall', -26, -124)
      nav.addNode('mission:west', -19, -124, 'mission')
      nav.addNode('archive:center', -46, -124, 'archive')
      nav.link('archive:hall', 'mission:west')
      nav.link('archive:center', 'archive:hall')
      continue
    }

    if (room.id === 'mission') {
      nav.addNode('mission:center', 0, -124, 'mission')
      nav.addNode('mission:south', 0, -106, 'mission')
      nav.link('mission:center', 'mission:south')
      nav.link('mission:south', spineId(nearChain(chain, -105)))
      continue
    }

    // --- rectangular labs and project modules -----------------------------
    const d = room.doors[0]
    const cx = room.center[0]
    const cz = room.center[1]
    const hw = room.size[0] / 2
    const hd = room.size[1] / 2
    let tx = cx
    let tz = cz
    let ix = cx
    let iz = cz
    switch (d.side) {
      case 'E':
        ix = cx + hw - 2.5
        tz = iz = cz + d.at
        tx = cx + hw + 1.5
        break
      case 'W':
        ix = cx - hw + 2.5
        tz = iz = cz + d.at
        tx = cx - hw - 1.5
        break
      case 'N':
        ix = cx + d.at
        iz = cz - hd + 2.5
        tx = ix
        tz = cz - hd - 1.5
        break
      case 'S':
        ix = cx + d.at
        iz = cz + hd - 2.5
        tx = ix
        tz = cz + hd + 1.5
        break
    }
    const doorId = `${room.id}:door`
    const entryId = `${room.id}:entry`
    const centerId = `${room.id}:center`
    const northId = `${room.id}:north`
    const southId = `${room.id}:south`
    nav.addNode(doorId, tx, tz, room.id)
    nav.addNode(entryId, ix, iz, room.id)
    nav.addNode(centerId, cx, cz, room.id)
    nav.addNode(northId, cx, cz - hd + 4.5, room.id)
    nav.addNode(southId, cx, cz + hd - 4.5, room.id)
    nav.link(doorId, entryId)
    nav.link(entryId, northId)
    nav.link(entryId, southId)
    nav.link(northId, centerId)
    nav.link(southId, centerId)
    nav.link(northId, southId)
    nav.link(doorId, spineId(nearChain(chain, cz)))
  }

  return nav
}

const round2 = (v: number) => Math.round(v * 100) / 100
const spineId = (z: number) => `spine:${round2(z)}`

function nearChain(chain: number[], z: number) {
  let best = chain[0]
  let bd = Infinity
  for (const cz of chain) {
    const d = Math.abs(cz - z)
    if (d < bd) {
      bd = d
      best = cz
    }
  }
  return best
}

/** Register every anchor with the graph so it becomes routable. */
export function attachAnchors(nav: NavGraph, anchors: Anchor[]) {
  for (const a of anchors) {
    nav.addAnchor(a)
    const nodeId = `a:${a.id}`
    const local = [...nav.nodes.values()]
      .filter((n) => n.roomId === a.roomId && n.id !== nodeId)
      .sort((p, q) => distSq2(p.x, p.z, a.x, a.z) - distSq2(q.x, q.z, a.x, a.z))
    if (local.length) {
      nav.link(nodeId, local[0].id)
      if (local[1] && dist2(local[1].x, local[1].z, a.x, a.z) < 20) nav.link(nodeId, local[1].id)
    } else {
      const cid = nav.closestNodeId(a.x, a.z)
      if (cid) nav.link(nodeId, cid)
    }
  }
}

// ---------------------------------------------------------------------------
// Collision: walkable union + solid obstacles
// ---------------------------------------------------------------------------

export type Obstacle =
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number }
  | { kind: 'circle'; x: number; z: number; r: number }

/** Build an axis-aligned box obstacle, widening it if the prop is rotated. */
export function obstacleFromBox(
  cx: number,
  cz: number,
  w: number,
  d: number,
  ry = 0,
): Obstacle {
  if (ry !== 0) {
    const c = Math.abs(Math.cos(ry))
    const s = Math.abs(Math.sin(ry))
    const sw = w * c + d * s
    const sd = w * s + d * c
    w = sw
    d = sd
  }
  return { kind: 'box', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }
}

export interface Walkable {
  rects: { minX: number; maxX: number; minZ: number; maxZ: number }[]
  circles: { x: number; z: number; r: number }[]
}

/** The union of every place a person can stand: corridors, doorways, room floors. */
export function buildWalkable(): Walkable {
  const rects: Walkable['rects'] = []
  const circles: Walkable['circles'] = []
  for (const c of CORRIDORS) rects.push(corridorBounds(c))
  for (const r of ROOMS) {
    const b = roomBounds(r, 0.9)
    if (b.round) circles.push({ x: b.x, z: b.z, r: b.radius })
    else rects.push(b)
  }
  return { rects, circles }
}

export function insideWalkable(w: Walkable, x: number, z: number, radius = 0) {
  for (const r of w.rects) {
    if (
      x >= r.minX - radius &&
      x <= r.maxX + radius &&
      z >= r.minZ - radius &&
      z <= r.maxZ + radius
    ) {
      return true
    }
  }
  for (const c of w.circles) {
    if (distSq2(x, z, c.x, c.z) <= (c.r + radius) * (c.r + radius)) return true
  }
  return false
}

export function hitsObstacle(obstacles: Obstacle[], x: number, z: number, radius: number) {
  for (const o of obstacles) {
    if (o.kind === 'circle') {
      if (distSq2(x, z, o.x, o.z) < (o.r + radius) * (o.r + radius)) return true
    } else if (
      x > o.minX - radius &&
      x < o.maxX + radius &&
      z > o.minZ - radius &&
      z < o.maxZ + radius
    ) {
      return true
    }
  }
  return false
}

/** Shared by the player and anything that leaves its rails. */
export function canStand(
  w: Walkable,
  obstacles: Obstacle[],
  x: number,
  z: number,
  radius: number,
  ignoreObstacles = false,
) {
  if (!insideWalkable(w, x, z, 0)) return false
  if (!ignoreObstacles && hitsObstacle(obstacles, x, z, radius)) return false
  return true
}
