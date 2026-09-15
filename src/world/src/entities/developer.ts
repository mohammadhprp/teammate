import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { C, M } from '../core/palette'

/**
 * The DEVELOPER — the player's avatar, seated in the white floating pod from
 * the reference sheet: curly dark-brown hair, round black glasses, charcoal
 * hoodie, dark pants, black-and-white sneakers, silver laptop.
 */

const SKIN = 0xf0c39c
const SKIN_SHADE = 0xdcac86
const HAIR = 0x4a3527
const CLOTH = 0x474d53
const CLOTH_DARK = 0x363b41
const SHOE = 0x24282b
const SOLE = 0xeceff1
const CHROME = 0xc9ced3

function std(color: number, roughness = 0.6, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness })
}

const mat = {
  skin: std(SKIN, 0.62, 0),
  skinShade: std(SKIN_SHADE, 0.62, 0),
  hair: std(HAIR, 0.78, 0),
  cloth: std(CLOTH, 0.82, 0),
  clothDark: std(CLOTH_DARK, 0.85, 0),
  shoe: std(SHOE, 0.7, 0.05),
  sole: std(SOLE, 0.5, 0.02),
  chrome: std(CHROME, 0.28, 0.85),
  glass: std(0x1d2226, 0.2, 0.4),
  eye: std(0x241a13, 0.4, 0),
}

export interface DeveloperAvatar {
  root: THREE.Group
  /** Everything above the pod, so it can bob and lean independently. */
  body: THREE.Group
  head: THREE.Group
  laptopScreen: THREE.Mesh
  podLight: THREE.PointLight
  radius: number
}

export function buildDeveloper(): DeveloperAvatar {
  const root = new THREE.Group()
  root.name = 'developer'

  // ---- floating pod -------------------------------------------------------
  const pod = new THREE.Group()
  const shellMat = std(0xf6f3ee, 0.42, 0.06)
  const shell = new THREE.Mesh(new RoundedBoxGeometry(3.5, 1.35, 3.1, 4, 0.62), shellMat)
  shell.position.y = 0.62
  shell.castShadow = true
  shell.receiveShadow = true
  pod.add(shell)

  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.17, 8, 40), shellMat)
  lip.rotation.x = Math.PI / 2
  lip.scale.set(1.08, 0.92, 1)
  lip.position.y = 1.24
  pod.add(lip)

  // cream seat shell with a dark cushion, so the charcoal hoodie reads against it
  const cushion = std(0x3b4045, 0.85, 0.02)
  const seat = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.34, 1.7, 2, 0.14), shellMat)
  seat.position.set(0, 1.24, 0.05)
  pod.add(seat)
  const cushionBase = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.14, 1.3, 2, 0.06), cushion)
  cushionBase.position.set(0, 1.42, 0.1)
  pod.add(cushionBase)
  const back = new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.88, 0.38, 3, 0.18), shellMat)
  back.position.set(0, 1.7, -0.72)
  back.rotation.x = -0.12
  pod.add(back)
  const backPad = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.6, 0.14, 3, 0.07), cushion)
  backPad.position.set(0, 1.72, -0.52)
  backPad.rotation.x = -0.12
  pod.add(backPad)

  // chrome trim + underglow + nozzles
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 6, 40), mat.chrome)
  trim.rotation.x = Math.PI / 2
  trim.scale.set(1.08, 0.92, 1)
  trim.position.y = 0.42
  pod.add(trim)
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x1d2b31,
    emissive: new THREE.Color(C.cyan),
    emissiveIntensity: 1.6,
    roughness: 0.4,
  })
  const underglow = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.055, 6, 40), glowMat)
  underglow.rotation.x = Math.PI / 2
  underglow.scale.set(1.06, 0.94, 1)
  underglow.position.y = 0.2
  pod.add(underglow)
  for (const s of [-1, 1]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.26, 14), std(0xd8d4cc, 0.4, 0.5))
    nozzle.position.set(s * 1.32, 0.18, -0.5)
    pod.add(nozzle)
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.05, 0.2, 12), M.glow(C.cyan, 1.2))
    jet.position.set(s * 1.32, 0.03, -0.5)
    pod.add(jet)
  }
  const pad = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.35, 1.1, 2, 0.12), std(0xe6e2da, 0.45, 0.05))
  pad.position.set(0, 0.95, 1.28)
  pod.add(pad)

  const podLight = new THREE.PointLight(C.cyan, 2.4, 7, 2)
  podLight.position.set(0, 0.1, 0)
  pod.add(podLight)
  root.add(pod)

  // ---- developer ----------------------------------------------------------
  const body = new THREE.Group()
  body.position.set(0, 1.42, 0)
  root.add(body)

  // legs folded forward, sneakers resting on the pod lip
  for (const s of [-1, 1]) {
    const thigh = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.4, 1.15, 2, 0.14), mat.clothDark)
    thigh.position.set(s * 0.3, 0.06, 0.62)
    thigh.rotation.x = -0.16
    body.add(thigh)
    const shin = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.72, 0.36, 2, 0.13), mat.clothDark)
    shin.position.set(s * 0.3, -0.4, 1.2)
    shin.rotation.x = 0.5
    body.add(shin)
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.26, 0.66, 3, 0.11), mat.shoe)
    shoe.position.set(s * 0.3, -0.72, 1.5)
    shoe.rotation.x = 0.18
    body.add(shoe)
    const sole = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.09, 0.7, 2, 0.04), mat.sole)
    sole.position.set(s * 0.3, -0.84, 1.52)
    sole.rotation.x = 0.18
    body.add(sole)
    for (let i = 0; i < 3; i++) {
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.05), mat.sole)
      lace.position.set(s * 0.3, -0.6 + i * 0.07, 1.34 + i * 0.08)
      lace.rotation.x = 0.3
      body.add(lace)
    }
  }

  // torso: charcoal hoodie — compact and rounded so it reads as a person, not a slab
  const torso = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.92, 0.6, 4, 0.29), mat.cloth)
  torso.position.set(0, 0.55, 0.02)
  torso.rotation.x = -0.1
  torso.castShadow = true
  body.add(torso)
  const hem = new THREE.Mesh(new RoundedBoxGeometry(0.88, 0.16, 0.64, 3, 0.07), mat.clothDark)
  hem.position.set(0, 0.06, 0.02)
  body.add(hem)
  // hood collar
  const hood = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.42, 0.46, 3, 0.21), mat.cloth)
  hood.position.set(0, 0.93, -0.24)
  hood.rotation.x = 0.35
  body.add(hood)
  const hoodBack = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), mat.cloth)
  hoodBack.position.set(0, 0.68, -0.3)
  hoodBack.scale.set(1.05, 0.8, 0.7)
  body.add(hoodBack)

  // arms reaching to the laptop
  for (const s of [-1, 1]) {
    const upper = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.72, 0.24, 2, 0.1), mat.cloth)
    upper.position.set(s * 0.52, 0.56, 0.14)
    upper.rotation.z = s * 0.2
    upper.rotation.x = -0.5
    body.add(upper)
    const fore = new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.19, 0.66, 2, 0.09), mat.cloth)
    fore.position.set(s * 0.55, 0.2, 0.56)
    fore.rotation.x = -0.35
    body.add(fore)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat.skin)
    hand.position.set(s * 0.52, 0.15, 0.86)
    body.add(hand)
  }

  // head — deliberately large and round, closer to the reference sheet
  const head = new THREE.Group()
  head.position.set(0, 1.26, 0.05)
  body.add(head)
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 20), mat.skin)
  skull.scale.set(1, 1.04, 0.95)
  skull.castShadow = true
  head.add(skull)
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), mat.skin)
  jaw.position.set(0, -0.19, 0.03)
  jaw.scale.set(0.9, 0.7, 0.9)
  head.add(jaw)
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat.skinShade)
    ear.position.set(s * 0.4, -0.03, 0)
    ear.scale.set(0.5, 1, 0.8)
    head.add(ear)
  }
  // nose + smile + brows
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat.skinShade)
  nose.position.set(0, -0.08, 0.4)
  head.add(nose)
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.018, 6, 16, Math.PI * 0.9), mat.eye)
  smile.position.set(0, -0.2, 0.36)
  smile.rotation.z = Math.PI + 0.25
  smile.rotation.x = -0.2
  head.add(smile)
  // eyes + round black glasses
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x14171a,
    roughness: 0.18,
    metalness: 0.35,
    transparent: true,
    opacity: 0.82,
  })
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), mat.eye)
    eye.position.set(s * 0.175, 0.0, 0.35)
    head.add(eye)
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.028, 8, 20), std(0x121417, 0.3, 0.4))
    rim.position.set(s * 0.18, 0.01, 0.365)
    head.add(rim)
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.148, 20), lensMat)
    lens.position.set(s * 0.18, 0.01, 0.362)
    head.add(lens)
    const brow = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.05, 0.06, 1, 0.02), mat.hair)
    brow.position.set(s * 0.185, 0.21, 0.35)
    brow.rotation.z = -s * 0.12
    head.add(brow)
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.032, 0.04), std(0x121417, 0.3, 0.4))
  bridge.position.set(0, 0.02, 0.375)
  head.add(bridge)
  for (const s of [-1, 1]) {
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.032, 0.24), std(0x121417, 0.3, 0.4))
    temple.position.set(s * 0.33, 0.05, 0.22)
    head.add(temple)
  }

  // curly hair: a cloud of small spheres over the crown and sides
  const hairGeo = new THREE.SphereGeometry(1, 10, 8)
  const curls: [number, number, number, number][] = []
  const ringSpec = [
    { n: 12, ring: 0.23, y: 0.4, r: 0.2 },
    { n: 12, ring: 0.4, y: 0.28, r: 0.21 },
    { n: 12, ring: 0.5, y: 0.08, r: 0.19 },
    { n: 10, ring: 0.48, y: -0.12, r: 0.15 },
    { n: 7, ring: 0.34, y: -0.24, r: 0.14 },
  ]
  ringSpec.forEach((spec, ri) => {
    for (let i = 0; i < spec.n; i++) {
      const a = (i / spec.n) * Math.PI * 2 + ri * 0.4
      const back = 1 - Math.max(0, Math.cos(a)) * (ri > 1 ? 0.75 : 0)
      void back
      curls.push([
        Math.sin(a) * spec.ring,
        spec.y + Math.sin(i * 2.3) * 0.03,
        Math.cos(a) * spec.ring * 1.02 - 0.03,
        spec.r,
      ])
    }
  })
  for (const [x, y, z, r] of curls) {
    // keep the face clear: nothing low and forward of the hairline
    if (z > 0.14 && y < 0.3) continue
    const curl = new THREE.Mesh(hairGeo, mat.hair)
    curl.position.set(x, y, z)
    curl.scale.setScalar(r)
    head.add(curl)
  }
  const crown = new THREE.Mesh(hairGeo, mat.hair)
  crown.position.set(0, 0.36, -0.02)
  crown.scale.setScalar(0.42)
  head.add(crown)
  const front = new THREE.Mesh(hairGeo, mat.hair)
  front.position.set(0, 0.42, 0.18)
  front.scale.set(0.4, 0.26, 0.3)
  head.add(front)
  const backMass = new THREE.Mesh(hairGeo, mat.hair)
  backMass.position.set(0, 0.14, -0.32)
  backMass.scale.set(0.46, 0.36, 0.32)
  head.add(backMass)

  // ---- silver laptop ------------------------------------------------------
  const laptop = new THREE.Group()
  laptop.position.set(0, 0.2, 0.9)
  laptop.rotation.x = -0.2
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.05, 0.6, 2, 0.02), mat.chrome)
  laptop.add(base)
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.012, 0.44), std(0x50565c, 0.7, 0.1))
  keys.position.y = 0.032
  laptop.add(keys)
  const lidPivot = new THREE.Group()
  lidPivot.position.set(0, 0.02, -0.29)
  lidPivot.rotation.x = -1.05
  const lid = new THREE.Mesh(new RoundedBoxGeometry(0.86, 0.56, 0.035, 2, 0.02), mat.chrome)
  lid.position.set(0, 0.28, 0)
  lidPivot.add(lid)
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0f1a20,
    emissive: new THREE.Color(0xd9f2fb),
    emissiveIntensity: 0.5,
    roughness: 0.3,
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.46), screenMat)
  screen.position.set(0, 0.28, 0.022)
  lidPivot.add(screen)
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), M.glow(C.cyan, 0.7))
  logo.position.set(0, 0.28, -0.03)
  logo.rotation.y = Math.PI
  lidPivot.add(logo)
  laptop.add(lidPivot)
  body.add(laptop)

  return {
    root,
    body,
    head,
    laptopScreen: screen,
    podLight,
    radius: 1.5,
  }
}
