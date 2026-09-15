import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Static-geometry batcher.
 *
 * The ship is made of thousands of small beveled pieces. Adding them as
 * individual meshes would drown the renderer in draw calls, so every static
 * piece is registered here and merged into one mesh per material at the end.
 * Anything that moves (doors, screens, robots, holograms) is built as a real
 * Object3D instead.
 */
export class MeshBatch {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  private count = 0

  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4) {
    const geo = matrix ? geometry.clone().applyMatrix4(matrix) : geometry.clone()
    normalize(geo)
    const list = this.buckets.get(material)
    if (list) list.push(geo)
    else this.buckets.set(material, [geo])
    this.count++
    return this
  }

  /** Convenience: place a piece with a translation + Y rotation (+ optional XYZ euler). */
  at(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    ry = 0,
    rx = 0,
    rz = 0,
    scale = 1,
  ) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(scale, scale, scale),
    )
    return this.add(geometry, material, m)
  }

  get pieceCount() {
    return this.count
  }

  build(name = 'batch'): THREE.Group {
    const group = new THREE.Group()
    group.name = name
    for (const [material, geometries] of this.buckets) {
      const merged = mergeGeometries(geometries, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      group.add(mesh)
      for (const g of geometries) g.dispose()
    }
    this.buckets.clear()
    return group
  }
}

/** Reduce a geometry to the position/normal/uv + index shape that merge needs. */
function normalize(geo: THREE.BufferGeometry) {
  for (const key of Object.keys(geo.attributes)) {
    if (key !== 'position' && key !== 'normal' && key !== 'uv') geo.deleteAttribute(key)
  }
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  if (!geo.getAttribute('uv')) {
    const n = geo.getAttribute('position').count
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  }
  if (!geo.index) {
    const n = geo.getAttribute('position').count
    const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n)
    for (let i = 0; i < n; i++) arr[i] = i
    geo.setIndex(new THREE.BufferAttribute(arr, 1))
  }
}

