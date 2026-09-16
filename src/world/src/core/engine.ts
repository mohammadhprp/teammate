import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { C, M } from './palette'
import { surfaceMapStats } from './surfaces'
import { clamp } from './math'

export interface UpdateFn {
  (dt: number, elapsed: number): void
}

/**
 * Renderer, camera, lighting rig and the frame loop.
 *
 * Lighting is intentionally studio-like: one soft key light coming through the
 * panoramic windows, a broad sky/ground hemisphere fill, and low-intensity
 * cyan accents the rooms add themselves. Bloom is subtle — enough to make
 * holograms read as light, never enough to look neon.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly composer: EffectComposer
  private bloom: UnrealBloomPass
  private key: THREE.DirectionalLight
  private updates: UpdateFn[] = []
  private last = performance.now()
  private paused = false
  private maxPixelRatio = 2
  elapsed = 0
  bloomEnabled = true

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene.background = new THREE.Color(C.space)
    this.scene.fog = new THREE.Fog(0x16242c, 150, 640)

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 3000)
    this.camera.position.set(0, 8, 12)

    // --- lighting rig -------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x6a6055, 0.6)
    this.scene.add(hemi)

    this.key = new THREE.DirectionalLight(0xfff2dd, 1.05)
    this.key.position.set(38, 60, 46)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(2048, 2048)
    this.key.shadow.bias = -0.0009
    this.key.shadow.normalBias = 0.045
    const d = 70
    const cam = this.key.shadow.camera as THREE.OrthographicCamera
    cam.left = -d
    cam.right = d
    cam.top = d
    cam.bottom = -d
    cam.near = 1
    cam.far = 220
    this.scene.add(this.key)
    this.scene.add(this.key.target)

    const rim = new THREE.DirectionalLight(0x9fd3ea, 0.28)
    rim.position.set(-40, 26, -52)
    this.scene.add(rim)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.1))

    // --- post processing ----------------------------------------------------
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.26,
      0.6,
      0.9,
    )
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    // --- environment --------------------------------------------------------
    // One small PMREM so entity metal and glass have something to reflect. It is
    // assigned per entity material in `M.applyEntityEnv` — never to
    // `scene.environment` — so the batched ship keeps its look byte for byte.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    M.applyEntityEnv(env)
    pmrem.dispose()
    if (import.meta.env.DEV) {
      console.debug(`[surfaces] ${surfaceMapStats().generated} procedural maps cached`)
    }

    window.addEventListener('resize', this.onResize)
  }

  /** Keep the shadow frustum around the player so shadows stay crisp ship-wide. */
  followShadow(x: number, z: number) {
    this.key.position.set(x + 38, 62, z + 46)
    this.key.target.position.set(x, 0, z)
    this.key.target.updateMatrixWorld()
  }

  setBloom(on: boolean) {
    this.bloomEnabled = on
    this.bloom.enabled = on
  }

  onUpdate(fn: UpdateFn) {
    this.updates.push(fn)
  }

  private onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
  }

  start() {
    this.renderer.setAnimationLoop(this.frame)
  }

  private frame = () => {
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now
    if (!this.paused) {
      this.elapsed += dt
      for (const fn of this.updates) fn(dt, this.elapsed)
    }
    if (this.bloomEnabled) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  setPaused(v: boolean) {
    this.paused = v
    if (!v) this.last = performance.now()
  }
}

/** Scale render quality down if the device is struggling. */
export function adaptiveQuality(engine: Engine, fps: number) {
  const ratio = clamp(fps / 60, 0.6, 1)
  engine.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1 + ratio))
}
