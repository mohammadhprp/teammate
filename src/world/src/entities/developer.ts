import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { C, M } from '../core/palette'
import { contactShadow } from '../core/surfaces'

/**
 * The DEVELOPER — the player's avatar, seated in the white floating egg pod from
 * the reference sheet: clumped dark curly hair, round black glasses over
 * visible eyes, charcoal hoodie with cuffs and hem, dark joggers, black-and-
 * white sneakers, silver laptop.
 *
 * Static pieces are merged per material (the pod and the seated figure are
 * rigid); only the hands stay separate groups so W-11's idle typing has
 * something to drive.
 */

const HPI = Math.PI / 2

type Part = {
  g: THREE.BufferGeometry
  p?: [number, number, number]
  r?: [number, number, number]
  sv?: [number, number, number]
}

function bake(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map(({ g, p, r, sv }) => {
    const geo = g.clone()
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(p ?? [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r ?? [0, 0, 0]))),
      new THREE.Vector3(...(sv ?? [1, 1, 1])),
    )
    geo.applyMatrix4(m)
    // RoundedBoxGeometry is non-indexed; merge needs every input to agree
    if (!geo.index) {
      const n = geo.getAttribute('position').count
      const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n)
      for (let i = 0; i < n; i++) arr[i] = i
      geo.setIndex(new THREE.BufferAttribute(arr, 1))
    }
    return geo
  })
  const merged = mergeGeometries(geos, false)!
  for (const g of geos) g.dispose()
  merged.computeBoundingSphere()
  return merged
}

/** A spherical cap on the pod shell — used for the rounded rear hatch. */
function cap(halfPhi: number, halfTheta: number) {
  return new THREE.SphereGeometry(
    1,
    28,
    18,
    Math.PI * 1.5 - halfPhi,
    halfPhi * 2,
    HPI - halfTheta,
    halfTheta * 2,
  )
}

export interface DeveloperAvatar {
  root: THREE.Group
  /** Everything above the pod, so it can bob and lean independently. */
  body: THREE.Group
  head: THREE.Group
  laptopScreen: THREE.Mesh
  podLight: THREE.PointLight
  /** Named for W-11: the idle typing pass drives these. */
  leftHand: THREE.Group
  rightHand: THREE.Group
  /** Floor blob; `game/player.ts` keeps it on the deck while the pod hovers. */
  contactShadow: THREE.Mesh
  radius: number
}

export function buildDeveloper(): DeveloperAvatar {
  const root = new THREE.Group()
  root.name = 'developer'

  // ---- floating egg pod ---------------------------------------------------
  const pod = new THREE.Group()
  const shellGeo = bake([
    // one continuous smooth egg shell
    { g: new THREE.SphereGeometry(1, 40, 28), p: [0, 0.6, 0], sv: [1.75, 0.72, 1.52] },
    // raised cream centre of the rear hatch
    { g: cap(0.34, 0.26), p: [0, 0.6, 0], sv: [1.774, 0.739, 1.541] },
  ])
  const shell = new THREE.Mesh(shellGeo, M.podShell)
  shell.castShadow = true
  shell.receiveShadow = true
  pod.add(shell)

  // shell seam + rear hatch frame
  const trimGeo = bake([
    { g: new THREE.TorusGeometry(1.7, 0.022, 8, 48), p: [0, 0.52, 0], r: [-HPI, 0, 0], sv: [1.02, 0.89, 1] },
    { g: cap(0.4, 0.31), p: [0, 0.6, 0], sv: [1.768, 0.737, 1.536] },
  ])
  pod.add(new THREE.Mesh(trimGeo, M.frameDark))

  // dark seat cushion + back pad
  const cushionGeo = bake([
    { g: new RoundedBoxGeometry(1.4, 0.16, 1.2, 3, 0.06), p: [0, 1.2, 0.06] },
    { g: new RoundedBoxGeometry(1.1, 0.62, 0.18, 3, 0.07), p: [0, 1.38, -0.5], r: [0.12, 0, 0] },
  ])
  pod.add(new THREE.Mesh(cushionGeo, M.cushion))

  // rear nozzles + jets
  const nozzleGeo = bake([
    { g: new THREE.CylinderGeometry(0.18, 0.22, 0.3, 14), p: [-0.46, 0.2, -1.3], r: [HPI, 0, 0] },
    { g: new THREE.CylinderGeometry(0.18, 0.22, 0.3, 14), p: [0.46, 0.2, -1.3], r: [HPI, 0, 0] },
  ])
  const nozzle = new THREE.Mesh(nozzleGeo, M.entitySteel)
  pod.add(nozzle)
  const jetGeo = bake([
    { g: new THREE.CylinderGeometry(0.13, 0.03, 0.16, 12), p: [-0.46, 0.2, -1.47], r: [HPI, 0, 0] },
    { g: new THREE.CylinderGeometry(0.13, 0.03, 0.16, 12), p: [0.46, 0.2, -1.47], r: [HPI, 0, 0] },
  ])
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0x1d2b31,
    emissive: new THREE.Color(C.cyan),
    emissiveIntensity: 1.6,
    roughness: 0.4,
  })
  pod.add(new THREE.Mesh(jetGeo, glowMat))

  // low cyan strip: one arc around the front and sides, open at the hatch
  const strip = new THREE.Mesh(
    new THREE.TorusGeometry(1.55, 0.045, 6, 40, 4.4),
    glowMat,
  )
  strip.rotation.x = -HPI
  strip.rotation.z = -HPI - 2.2
  strip.scale.set(0.94, 0.82, 1)
  strip.position.y = 0.2
  pod.add(strip)

  const podLight = new THREE.PointLight(C.cyan, 2.4, 7, 2)
  podLight.position.set(0, 0.1, 0)
  pod.add(podLight)
  root.add(pod)

  // ---- developer ----------------------------------------------------------
  const body = new THREE.Group()
  body.position.set(0, 1.42, 0)
  root.add(body)

  // legs folded forward, sneakers resting on the pod lip
  const pantsParts: Part[] = []
  const shoeParts: Part[] = []
  const soleParts: Part[] = []
  for (const s of [-1, 1]) {
    pantsParts.push({ g: new RoundedBoxGeometry(0.38, 0.4, 1.15, 2, 0.14), p: [s * 0.3, 0.06, 0.62], r: [-0.16, 0, 0] })
    pantsParts.push({ g: new RoundedBoxGeometry(0.34, 0.72, 0.36, 2, 0.13), p: [s * 0.3, -0.4, 1.2], r: [0.5, 0, 0] })
    pantsParts.push({ g: new RoundedBoxGeometry(0.36, 0.16, 0.4, 2, 0.05), p: [s * 0.3, -0.62, 1.34], r: [0.24, 0, 0] })
    shoeParts.push({ g: new RoundedBoxGeometry(0.36, 0.26, 0.66, 3, 0.11), p: [s * 0.3, -0.72, 1.5], r: [0.18, 0, 0] })
    shoeParts.push({ g: new RoundedBoxGeometry(0.36, 0.17, 0.24, 2, 0.08), p: [s * 0.3, -0.79, 1.78], r: [0.18, 0, 0] })
    shoeParts.push({ g: new RoundedBoxGeometry(0.24, 0.13, 0.18, 2, 0.05), p: [s * 0.3, -0.6, 1.62], r: [0.3, 0, 0] })
    soleParts.push({ g: new RoundedBoxGeometry(0.4, 0.09, 0.72, 2, 0.04), p: [s * 0.3, -0.84, 1.52], r: [0.18, 0, 0] })
    for (let i = 0; i < 3; i++) {
      soleParts.push({
        g: new THREE.BoxGeometry(0.22, 0.028, 0.04),
        p: [s * 0.3, -0.66 + i * 0.06, 1.53 + i * 0.06],
        r: [0.3, 0, 0],
      })
    }
  }
  const pants = new THREE.Mesh(bake(pantsParts), M.fabricDark)
  pants.castShadow = true
  body.add(pants)
  const shoes = new THREE.Mesh(bake(shoeParts), M.shoeMat)
  shoes.castShadow = true
  body.add(shoes)
  body.add(new THREE.Mesh(bake(soleParts), M.soleMat))

  // torso: charcoal hoodie — compact and rounded so it reads as a person
  const clothParts: Part[] = [
    { g: new RoundedBoxGeometry(0.86, 0.92, 0.6, 4, 0.29), p: [0, 0.55, 0.02], r: [-0.1, 0, 0] },
    { g: new RoundedBoxGeometry(0.78, 0.42, 0.46, 3, 0.21), p: [0, 0.93, -0.24], r: [0.35, 0, 0] },
    { g: new THREE.SphereGeometry(0.34, 16, 12), p: [0, 0.68, -0.3], sv: [1.05, 0.8, 0.7] },
  ]
  const darkClothParts: Part[] = [
    // hem
    { g: new RoundedBoxGeometry(0.9, 0.18, 0.66, 3, 0.08), p: [0, 0.06, 0.02] },
  ]
  for (const s of [-1, 1]) {
    clothParts.push({
      g: new RoundedBoxGeometry(0.22, 0.72, 0.24, 2, 0.1),
      p: [s * 0.5, 0.56, 0.14],
      r: [-0.5, 0, s * 0.22],
    })
    clothParts.push({
      g: new RoundedBoxGeometry(0.19, 0.19, 0.66, 2, 0.09),
      p: [s * 0.46, 0.2, 0.6],
      r: [-0.35, -s * 0.12, 0],
    })
    darkClothParts.push({
      g: new RoundedBoxGeometry(0.24, 0.24, 0.1, 2, 0.05),
      p: [s * 0.42, 0.19, 0.86],
      r: [-0.35, 0, 0],
    })
  }
  const torso = new THREE.Mesh(bake(clothParts), M.fabric)
  torso.castShadow = true
  body.add(torso)
  body.add(new THREE.Mesh(bake(darkClothParts), M.fabricDark))

  // named hands for W-11 — separate groups so they can pivot at the wrist
  const handGeo = new THREE.SphereGeometry(0.13, 12, 10)
  const hands: THREE.Group[] = []
  for (const s of [-1, 1]) {
    const hand = new THREE.Group()
    hand.name = s < 0 ? 'leftHand' : 'rightHand'
    hand.position.set(s * 0.38, 0.2, 0.98)
    hand.rotation.x = -0.3
    const palm = new THREE.Mesh(handGeo, M.skinSoft)
    palm.scale.set(1, 0.8, 1.15)
    palm.castShadow = true
    hand.add(palm)
    body.add(hand)
    hands.push(hand)
  }

  // head — deliberately large and round, closer to the reference sheet
  const head = new THREE.Group()
  head.position.set(0, 1.26, 0.05)
  body.add(head)
  const skull = new THREE.Mesh(
    bake([
      { g: new THREE.SphereGeometry(0.42, 24, 20), p: [0, 0, 0], sv: [1, 1.04, 0.95] },
      { g: new THREE.SphereGeometry(0.34, 20, 16), p: [0, -0.19, 0.03], sv: [0.9, 0.7, 0.9] },
    ]),
    M.skinSoft,
  )
  skull.castShadow = true
  head.add(skull)
  head.add(
    new THREE.Mesh(
      bake([
        { g: new THREE.SphereGeometry(0.09, 10, 8), p: [-0.4, -0.03, 0], sv: [0.5, 1, 0.8] },
        { g: new THREE.SphereGeometry(0.09, 10, 8), p: [0.4, -0.03, 0], sv: [0.5, 1, 0.8] },
        { g: new THREE.SphereGeometry(0.07, 10, 8), p: [0, -0.08, 0.4] },
      ]),
      M.skinWarm,
    ),
  )

  // glasses frames, smile, brows and irises — one matte black mesh
  const faceDark: Part[] = [
    { g: new THREE.TorusGeometry(0.115, 0.018, 6, 16, Math.PI * 0.9), p: [0, -0.2, 0.36], r: [-0.2, 0, Math.PI + 0.25] },
    { g: new THREE.BoxGeometry(0.1, 0.032, 0.04), p: [0, 0.02, 0.395] },
  ]
  for (const s of [-1, 1]) {
    faceDark.push({ g: new THREE.TorusGeometry(0.155, 0.028, 8, 20), p: [s * 0.18, 0.01, 0.385] })
    faceDark.push({ g: new THREE.BoxGeometry(0.032, 0.032, 0.24), p: [s * 0.33, 0.05, 0.22] })
    faceDark.push({ g: new THREE.SphereGeometry(0.042, 10, 8), p: [s * 0.175, 0.0, 0.356], sv: [1, 1, 0.7] })
  }
  head.add(new THREE.Mesh(bake(faceDark), M.frameGlasses))

  // eye whites, visible behind the nearly clear lenses
  head.add(
    new THREE.Mesh(
      bake([
        { g: new THREE.SphereGeometry(0.072, 12, 10), p: [-0.175, 0.0, 0.34], sv: [1, 1, 0.65] },
        { g: new THREE.SphereGeometry(0.072, 12, 10), p: [0.175, 0.0, 0.34], sv: [1, 1, 0.65] },
      ]),
      M.eyeWhite,
    ),
  )
  const lenses = new THREE.Mesh(
    bake([
      { g: new THREE.CircleGeometry(0.148, 20), p: [-0.18, 0.01, 0.375] },
      { g: new THREE.CircleGeometry(0.148, 20), p: [0.18, 0.01, 0.375] },
    ]),
    M.eyeglass,
  )
  lenses.renderOrder = 2
  head.add(lenses)

  // curly hair: overlapping clumps of curls, deliberate and uneven
  const curls: [number, number, number, number][] = [
    [0, 0.3, -0.06, 0.38],
    [0, 0.1, -0.3, 0.4],
    [-0.24, 0.28, -0.16, 0.26],
    [0.24, 0.28, -0.16, 0.26],
    [-0.34, 0.12, -0.02, 0.24],
    [0.34, 0.12, -0.02, 0.24],
    [-0.34, 0.26, 0.04, 0.2],
    [0.34, 0.26, 0.04, 0.2],
    [0, 0.46, 0.08, 0.27],
    [-0.2, 0.42, 0.14, 0.2],
    [0.2, 0.42, 0.14, 0.2],
    [-0.16, 0.5, -0.02, 0.2],
    [0.16, 0.5, -0.02, 0.2],
    [-0.42, 0.06, 0.1, 0.16],
    [0.42, 0.06, 0.1, 0.16],
    [0, 0.16, -0.42, 0.26],
    [-0.2, 0.02, -0.34, 0.18],
    [0.2, 0.02, -0.34, 0.18],
    [-0.1, 0.54, 0.0, 0.17],
    [0.1, 0.54, 0.0, 0.17],
    [-0.44, 0.2, 0.0, 0.14],
    [0.44, 0.2, 0.0, 0.14],
    [0, 0.36, -0.34, 0.24],
    [-0.28, 0.44, -0.1, 0.15],
    [0.28, 0.44, -0.1, 0.15],
  ]
  const hairParts: Part[] = curls.map(([x, y, z, r]) => ({
    g: new THREE.SphereGeometry(1, 10, 8),
    p: [x, y, z],
    sv: [r, r, r],
  }))
  for (const s of [-1, 1]) {
    hairParts.push({
      g: new RoundedBoxGeometry(0.22, 0.05, 0.06, 1, 0.02),
      p: [s * 0.185, 0.21, 0.35],
      r: [0, 0, -s * 0.12],
    })
  }
  const hair = new THREE.Mesh(bake(hairParts), M.hairMat)
  hair.castShadow = true
  head.add(hair)

  // ---- silver laptop ------------------------------------------------------
  const laptop = new THREE.Group()
  laptop.position.set(0, 0.2, 0.9)
  laptop.rotation.x = -0.2
  laptop.add(
    new THREE.Mesh(
      bake([
        { g: new RoundedBoxGeometry(0.86, 0.05, 0.6, 2, 0.02), p: [0, 0, 0] },
        { g: new RoundedBoxGeometry(0.86, 0.56, 0.035, 2, 0.02), p: [0, 0.3, -0.29], r: [-1.05, 0, 0] },
      ]),
      M.entityChrome,
    ),
  )
  const keys = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.012, 0.44), M.frameDark)
  keys.position.y = 0.032
  laptop.add(keys)
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0f1a20,
    emissive: new THREE.Color(0xd9f2fb),
    emissiveIntensity: 0.5,
    roughness: 0.3,
  })
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.46), screenMat)
  screen.position.set(0, 0.3, -0.262)
  screen.rotation.x = -1.05
  laptop.add(screen)
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), M.glow(C.cyan, 0.7))
  logo.position.set(0, 0.3, -0.325)
  logo.rotation.set(-1.05, Math.PI, 0)
  laptop.add(logo)
  body.add(laptop)

  const shadow = contactShadow(1.75, 2.0, 0.32)
  root.add(shadow)

  return {
    root,
    body,
    head,
    laptopScreen: screen,
    podLight,
    leftHand: hands[0],
    rightHand: hands[1],
    contactShadow: shadow,
    radius: 1.5,
  }
}
