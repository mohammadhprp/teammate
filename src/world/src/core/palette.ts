import * as THREE from 'three'
import {
  cavityAOMap,
  fabricNormal,
  microNormal,
  panelNormal,
  roughnessVariation,
} from './surfaces'

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

  // --- entity surfaces (additive) ------------------------------------------
  // The ship's materials above are untouched on purpose: batched geometry keys
  // by material identity, so mutating one would repaint the whole ship. These
  // are used only by the robot and the developer.
  //
  // Four procedural maps are generated once and shared across every entity
  // material; per-material strength lives in `normalScale`, and `roughness` is
  // the real base value (the shared roughness map only adds variation).
  private readonly eDetail = cavityAOMap(256, 0.09)
  private readonly eGrain = microNormal(128, 1)
  private readonly ePanel = panelNormal(256, [0.34, 0.67])
  private readonly eTooth = roughnessVariation(128, 1, 0.15)
  private readonly eWeave = fabricNormal(256, 0.8)

  /** Matte cream entity plastic — robot chassis, barrels, hatch frame. */
  readonly plasticCream = std(0xe7e0d2, 0.64, 0.02, {
    map: this.eDetail,
    normalMap: this.ePanel,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughnessMap: this.eTooth,
  })

  /** Near-black mechanical frame — tracks housing, head band, seams. */
  readonly frameDark = std(0x212428, 0.5, 0.34, {
    map: this.eDetail,
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughnessMap: this.eTooth,
  })

  /** Belt rubber: deep matte with a strong tooth. */
  readonly trackRubber = std(0x191b1d, 0.94, 0.04, {
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: this.eTooth,
  })

  /** Brushed steel hardware — hubs, rings, screws. */
  readonly entitySteel = std(C.steel, 0.34, 0.82, {
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughnessMap: this.eTooth,
  })

  /** Polished chrome — developer's laptop. */
  readonly entityChrome = std(0xd4d8dc, 0.2, 0.92, {
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.12, 0.12),
    roughnessMap: this.eTooth,
  })

  /** Real lens glass: dark, glossy, clearcoated. Per-robot clones add emissive. */
  readonly lensGlass = new THREE.MeshPhysicalMaterial({
    color: 0x0b0f12,
    roughness: 0.1,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  })

  /** Hoodie fabric: matte charcoal with a soft sheen Standard cannot give. */
  readonly fabric = new THREE.MeshPhysicalMaterial({
    color: 0x474d53,
    roughness: 0.94,
    metalness: 0,
    sheen: 0.55,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color(0x8a929b),
    normalMap: this.eWeave,
    normalScale: new THREE.Vector2(0.5, 0.5),
  })

  /** Darker fabric for the hood lining, cuffs and hem. */
  readonly fabricDark = new THREE.MeshPhysicalMaterial({
    color: 0x363b41,
    roughness: 0.96,
    metalness: 0,
    sheen: 0.4,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color(0x717980),
    normalMap: this.eWeave,
    normalScale: new THREE.Vector2(0.5, 0.5),
  })

  /** Soft skin with a trace of sheen so the face catches the key light. */
  readonly skinSoft = new THREE.MeshPhysicalMaterial({
    color: 0xf0c39c,
    roughness: 0.58,
    metalness: 0,
    sheen: 0.22,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color(0xffd9bb),
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.18, 0.18),
  })

  readonly skinWarm = new THREE.MeshStandardMaterial({
    color: 0xdcac86,
    roughness: 0.6,
    metalness: 0,
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.18, 0.18),
  })

  readonly hairMat = new THREE.MeshStandardMaterial({
    color: 0x4a3527,
    roughness: 0.84,
    metalness: 0,
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.7, 0.7),
  })

  readonly shoeMat = new THREE.MeshStandardMaterial({
    color: 0x24282b,
    roughness: 0.52,
    metalness: 0.08,
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.3, 0.3),
  })

  readonly soleMat = new THREE.MeshStandardMaterial({
    color: 0xeceff1,
    roughness: 0.5,
    metalness: 0.02,
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.3, 0.3),
  })

  /** Matte black glasses frame. */
  readonly frameGlasses = std(0x121417, 0.34, 0.4)

  /** Eye white — a touch glossy so the eyes catch the key light. */
  readonly eyeWhite = std(0xf3f0ea, 0.34, 0)

  /** Nearly clear glasses lens, so the eyes still read through the frame. */
  readonly eyeglass = new THREE.MeshPhysicalMaterial({
    color: 0x9fb4bd,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  })

  /** Pod shell cream — smoother than the robot plastic. */
  readonly podShell = std(0xf6f3ee, 0.4, 0.06, {
    map: this.eDetail,
    normalMap: this.eGrain,
    normalScale: new THREE.Vector2(0.22, 0.22),
  })

  /** Pod / seat cushion fabric. */
  readonly cushion = std(0x3b4045, 0.88, 0.02, {
    normalMap: this.eWeave,
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughnessMap: this.eTooth,
  })

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

  /**
   * Give the entity surfaces something to reflect. Called once by the engine
   * with a PMREM environment; assigned per material (never
   * `scene.environment`) so the batched ship is guaranteed unchanged.
   */
  applyEntityEnv(env: THREE.Texture) {
    const set = (mat: THREE.MeshStandardMaterial, intensity: number) => {
      mat.envMap = env
      mat.envMapIntensity = intensity
      mat.needsUpdate = true
    }
    set(this.entitySteel, 0.9)
    set(this.entityChrome, 1)
    set(this.lensGlass, 1)
    set(this.podShell, 0.35)
    set(this.plasticCream, 0.3)
    set(this.frameDark, 0.5)
    set(this.frameGlasses, 0.6)
    set(this.shoeMat, 0.3)
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
