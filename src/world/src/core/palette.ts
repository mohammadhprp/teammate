import * as THREE from 'three'

/**
 * TEAM MATE palette.
 *
 * Warm white / cream hull, light gray floors, dark charcoal mechanics, and a
 * single cyan lighting accent. Agent roles add one saturated accent each.
 * Nothing here is neon: emissives are used sparingly, like indicator LEDs.
 */
export const C = {
  warmWhite: 0xf1ece3,
  cream: 0xe4dccb,
  creamDeep: 0xd2c8b2,
  bone: 0xf7f4ee,

  floor: 0xd2cec5,
  floorDark: 0xb8b3a8,

  gray: 0xa9a8a3,
  grayDark: 0x6f7073,

  charcoal: 0x3a3e42,
  charcoalDeep: 0x24272b,
  rubber: 0x1c1e20,
  black: 0x121314,

  metal: 0xb4b8bd,
  steel: 0x8c9197,
  copper: 0xb0793f,

  cyan: 0x5fd8f0,
  cyanDeep: 0x1d6d86,

  green: 0x46c47c,
  blue: 0x4d9df2,
  gold: 0xf0c04a,
  red: 0xef5a45,

  space: 0x05070d,
}

export type AccentName = 'cyan' | 'green' | 'blue' | 'gold' | 'red' | 'none'

export const ACCENT: Record<AccentName, number> = {
  cyan: C.cyan,
  green: C.green,
  blue: C.blue,
  gold: C.gold,
  red: C.red,
  none: C.charcoal,
}

function std(
  color: number,
  roughness: number,
  metalness: number,
  extra: Partial<THREE.MeshStandardMaterialParameters> = {},
) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra })
}

/**
 * Shared material library. Every prop pulls from here so the ship uses a small,
 * coherent set of surfaces — and so batched geometry merges into few draw calls.
 */
class Materials {
  readonly hull = std(C.warmWhite, 0.62, 0.05)
  readonly hullSoft = std(C.cream, 0.72, 0.02)
  readonly hullDeep = std(C.creamDeep, 0.78, 0.03)
  readonly trim = std(C.bone, 0.5, 0.08)
  readonly floor = std(C.floor, 0.55, 0.04)
  readonly floorPanel = std(C.floorDark, 0.6, 0.06)
  readonly grate = std(C.gray, 0.65, 0.35)

  readonly metal = std(C.metal, 0.35, 0.85)
  readonly steel = std(C.steel, 0.4, 0.8)
  readonly dark = std(C.charcoal, 0.55, 0.55)
  readonly darker = std(C.charcoalDeep, 0.6, 0.5)
  readonly rubber = std(C.rubber, 0.9, 0.1)
  readonly black = std(C.black, 0.7, 0.3)

  /** Window glazing: barely there, just enough to catch a highlight. */
  readonly glass = new THREE.MeshPhysicalMaterial({
    color: 0xcfe3ee,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  })

  /** Curved hull pieces must render from the inside, so they are double sided. */
  readonly shell = std(C.warmWhite, 0.62, 0.05, { side: THREE.DoubleSide })
  readonly shellSoft = std(C.cream, 0.72, 0.02, { side: THREE.DoubleSide })
  readonly shellDeep = std(C.creamDeep, 0.78, 0.03, { side: THREE.DoubleSide })
  readonly shellDark = std(C.charcoal, 0.55, 0.55, { side: THREE.DoubleSide })
  readonly shellFloor = std(C.floor, 0.55, 0.04, { side: THREE.DoubleSide })

  readonly lampWarm = std(0xfff4e2, 0.4, 0, { emissive: 0xffe9c9, emissiveIntensity: 0.6 })
  readonly leaf = new THREE.MeshStandardMaterial({
    color: 0x6f9b63,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  readonly leafDark = new THREE.MeshStandardMaterial({
    color: 0x4f7a4a,
    roughness: 0.78,
    metalness: 0,
    side: THREE.DoubleSide,
  })

  private accents = new Map<number, THREE.MeshStandardMaterial>()
  private accentGlow = new Map<number, THREE.MeshStandardMaterial>()
  private holoMats = new Map<string, THREE.MeshBasicMaterial>()

  /** Saturated accent surface (painted panel, status ring). */
  accent(color: number) {
    let m = this.accents.get(color)
    if (!m) {
      m = std(color, 0.42, 0.2, { emissive: new THREE.Color(color), emissiveIntensity: 0.18 })
      this.accents.set(color, m)
    }
    return m
  }

  /** Accent that actually glows — indicators, hologram rims, screens. */
  glow(color: number, intensity = 1.6) {
    const key = color + intensity * 1000
    let m = this.accentGlow.get(key)
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(0.55),
        roughness: 0.35,
        metalness: 0,
        emissive: new THREE.Color(color),
        emissiveIntensity: intensity,
      })
      this.accentGlow.set(key, m)
    }
    return m
  }

  /** Slightly transparent hologram body. */
  holo(color: number, opacity = 0.3) {
    const key = `${color}|${opacity.toFixed(3)}`
    let m = this.holoMats.get(key)
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      this.holoMats.set(key, m)
    }
    return m
  }
}

export const M = new Materials()
