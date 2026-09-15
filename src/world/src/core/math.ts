/** Small math helpers shared across the world. */

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const invLerp = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a))

/** Frame-rate independent smoothing. `lambda` is "how much per second". */
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt))

export const smoothstep = (t: number) => {
  t = clamp(t, 0, 1)
  return t * t * (3 - 2 * t)
}

export const easeInOut = smoothstep

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3)

export const easeInOutCubic = (t: number) => {
  t = clamp(t, 0, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export const TAU = Math.PI * 2

/** Shortest signed angular distance from a to b, in (-PI, PI]. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

export const dist2 = (ax: number, az: number, bx: number, bz: number) =>
  Math.hypot(ax - bx, az - bz)

export const distSq2 = (ax: number, az: number, bx: number, bz: number) => {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

/** Deterministic pseudo random in [0,1) — keeps the ship identical between runs. */
export function makeRng(seed = 1337) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}
