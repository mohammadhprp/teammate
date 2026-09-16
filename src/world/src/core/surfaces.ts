import * as THREE from 'three'
import { makeCanvas } from './textures'
import { makeRng } from './math'

/**
 * Procedural surface maps.
 *
 * The ship's displays are canvas-drawn in `textures.ts`; this module is the
 * material equivalent — every normal / roughness / cavity map on the entities
 * is generated at runtime and cached by key, so no art files ship and the same
 * map is reused across every robot and avatar. Kept separate from
 * `textures.ts` because these are reusable *surfaces*, not data displays, and
 * the prop kit (W-13) can pull the same treatment later.
 *
 * Colour-space rules: albedo detail maps are sRGB; normal / roughness data maps
 * are `NoColorSpace`. All maps are 1:1 and wrap, so they tile on any box face.
 */

const cache = new Map<string, THREE.Texture>()
let generated = 0

/** How many distinct maps have actually been built (a cache miss), for the plan. */
export function surfaceMapStats() {
  return { generated, cached: cache.size }
}

function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let tex = cache.get(key)
  if (!tex) {
    tex = make()
    tex.name = key
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.needsUpdate = true
    cache.set(key, tex)
    generated++
  }
  return tex
}

/** Smooth deterministic value noise in [0,1]. */
function noiseField(size: number, freq: number, seed: number): Float32Array {
  const rng = makeRng(seed)
  const g = Math.max(2, Math.floor(freq))
  const grid = new Float32Array(g * g)
  for (let i = 0; i < grid.length; i++) grid[i] = rng()
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * g
      const v = (y / size) * g
      const x0 = Math.floor(u)
      const y0 = Math.floor(v)
      const fx = u - x0
      const fy = v - y0
      const sx = fx * fx * (3 - 2 * fx)
      const sy = fy * fy * (3 - 2 * fy)
      const x1 = (x0 + 1) % g
      const y1 = (y0 + 1) % g
      const i00 = grid[(y0 % g) * g + (x0 % g)]
      const i10 = grid[(y0 % g) * g + x1]
      const i01 = grid[y1 * g + (x0 % g)]
      const i11 = grid[y1 * g + x1]
      const a = i00 + (i10 - i00) * sx
      const b = i01 + (i11 - i01) * sx
      out[y * size + x] = a + (b - a) * sy
    }
  }
  return out
}

function fbm(size: number, seed: number): Float32Array {
  const out = new Float32Array(size * size)
  const octaves = [
    { freq: 4, amp: 0.5 },
    { freq: 9, amp: 0.28 },
    { freq: 19, amp: 0.14 },
    { freq: 41, amp: 0.08 },
  ]
  for (const { freq, amp } of octaves) {
    const f = noiseField(size, freq, seed + freq)
    for (let i = 0; i < out.length; i++) out[i] += f[i] * amp
  }
  return out
}

/** A height field → tangent-space normal map (blue = up, RGB = XYZ). */
function normalFromHeight(size: number, height: Float32Array, strength: number): THREE.Texture {
  const { canvas, ctx } = makeCanvas(size, size)
  const img = ctx.createImageData(size, size)
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength
      const ny = (at(x, y - 1) - at(x, y + 1)) * strength
      const len = Math.hypot(nx, ny, 1)
      const i = (y * size + x) * 4
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.NoColorSpace
  tex.anisotropy = 4
  return tex
}

/** Fine isotropic micro-grain — plastic, metal, painted panels. */
export function microNormal(size = 128, strength = 1): THREE.Texture {
  return cached(`micro|${size}|${strength}`, () => {
    const h = fbm(size, 101)
    // centre the grain so it reads as bumps, not a slope
    for (let i = 0; i < h.length; i++) h[i] = h[i] - 0.5
    return normalFromHeight(size, h, 5.5 * strength)
  })
}

/** Woven cross-hatch — hoodie, cushion fabric. */
export function fabricNormal(size = 256, strength = 1): THREE.Texture {
  return cached(`fabric|${size}|${strength}`, () => {
    const h = new Float32Array(size * size)
    const base = noiseField(size, 40, 707)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2 * 10
        const v = (y / size) * Math.PI * 2 * 10
        const weave = Math.sin(u) * 0.35 + Math.sin(v) * 0.35 + Math.sin(u + v) * 0.16
        h[y * size + x] = weave + (base[y * size + x] - 0.5) * 0.5
      }
    }
    return normalFromHeight(size, h, 3.4 * strength)
  })
}

/** Horizontal panel grooves at the given normalised heights. */
export function panelNormal(size = 256, lines: number[] = [0.5], strength = 1): THREE.Texture {
  const key = `panel|${size}|${lines.join(',')}|${strength}`
  return cached(key, () => {
    const h = new Float32Array(size * size)
    const base = fbm(size, 313)
    for (let i = 0; i < h.length; i++) h[i] = (base[i] - 0.5) * 0.6
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let groove = 0
        for (const l of lines) {
          const d = Math.abs(y / size - l)
          if (d < 0.02) groove -= (1 - d / 0.02) * 1.6
        }
        h[y * size + x] += groove
      }
    }
    return normalFromHeight(size, h, 4 * strength)
  })
}

/**
 * Roughness variation around a base value. Used as a `roughnessMap`, so the
 * owning material keeps `roughness = 1` and the map carries the real value.
 */
export function roughnessVariation(size = 128, base = 0.7, spread = 0.15): THREE.Texture {
  return cached(`rough|${size}|${base}|${spread}`, () => {
    const h = fbm(size, 909)
    const { canvas, ctx } = makeCanvas(size, size)
    const img = ctx.createImageData(size, size)
    for (let i = 0; i < h.length; i++) {
      const v = Math.max(0, Math.min(1, base + (h[i] - 0.5) * spread * 2))
      const p = i * 4
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v * 255
      img.data[p + 3] = 255
    }
    ctx.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.NoColorSpace
    tex.anisotropy = 2
    return tex
  })
}

/**
 * Cavity / edge AO, multiplied into the albedo `map` (the project keeps uv
 * channel 0 only, and `aoMap` wants a second UV set on r186). Near-white with a
 * soft edge vignette and micro-grain, so bevels darken and surfaces gain tooth.
 */
export function cavityAOMap(size = 256, inset = 0.08): THREE.Texture {
  return cached(`cavity|${size}|${inset}`, () => {
    const grain = fbm(size, 555)
    const { canvas, ctx } = makeCanvas(size, size)
    const img = ctx.createImageData(size, size)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1)
        const v = y / (size - 1)
        const ex = Math.min(u, 1 - u) / inset
        const ey = Math.min(v, 1 - v) / inset
        const edge = Math.min(1, Math.min(ex, ey))
        const ao = 0.62 + 0.38 * (edge * edge * (3 - 2 * edge))
        const tooth = 1 - (grain[y * size + x] - 0.5) * 0.22
        const p = (y * size + x) * 4
        const c = ao * tooth * 255
        img.data[p] = img.data[p + 1] = img.data[p + 2] = c
        img.data[p + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return tex
  })
}

/** Soft radial blob used for the entity contact shadow. */
export function contactShadowTexture(): THREE.Texture {
  return cached('contact', () => {
    const S = 128
    const { canvas, ctx } = makeCanvas(S, S)
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(0,0,0,0.62)')
    g.addColorStop(0.55, 'rgba(0,0,0,0.3)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  })
}

const shadowGeometry = new THREE.PlaneGeometry(1, 1)

/**
 * A flat, floor-hugging contact shadow. `depthWrite: false`, a small
 * `polygonOffset` and an explicit `renderOrder` keep it from fighting the deck
 * or the status ring; the caller fades it by writing `material.opacity`.
 */
export function contactShadow(
  radiusX = 1,
  radiusZ = radiusX,
  opacity = 0.4,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({
      map: contactShadowTexture(),
      color: 0x000000,
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.scale.set(radiusX * 2, radiusZ * 2, 1)
  mesh.renderOrder = 1
  return mesh
}
