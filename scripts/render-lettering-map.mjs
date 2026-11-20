// Presentation image: the outer sidewall seen straight on, lettering in white on
// transparent, plus the callout anchors (JSON) for overlaying in a layout.
// Usage: node scripts/render-lettering-map.mjs <out.png>
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { CALLOUTS } from '../src/site/content.js'

await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read('public/models/tire.glb')

const S = 2400 // px
const SCALE = S / 1.0 // px per metre: 1 m across
const C = S / 2
// seen from +X: three.js +Z is on the left, +Y up; wheel centre at y = 0.4
const px = (y, z) => [C - z * SCALE, C - (y - 0.4) * SCALE]

let polys = ''
const v = [0, 0, 0]
for (const node of doc.getRoot().listNodes()) {
  const name = node.getName()
  if (!node.getMesh() || !(name === 'Texts' || name.startsWith('Tire.Side2'))) continue
  const prim0 = node.getMesh().listPrimitives()[0]
  const isBody = name.includes('Rubber Glossy')
  // two "Rubber Lines" meshes: the striped bands (small) and the moulded logo/size/series lettering
  const isBands = prim0.getMaterial()?.getName().startsWith('Rubber Lines') && prim0.getIndices().getCount() / 3 < 800
  const m = node.getWorldMatrix()
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute('POSITION')
    const idx = prim.getIndices()
    const P = []
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v)
      P.push([
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
      ])
    }
    const fill = isBody ? '#161616' : isBands ? '#2e2e2e' : '#ffffff'
    let d = ''
    for (let t = 0; t < idx.getCount(); t += 3) {
      const a = P[idx.getScalar(t)], b = P[idx.getScalar(t + 1)], c = P[idx.getScalar(t + 2)]
      if (a[0] <= 0) continue // outer sidewall only
      const [x1, y1] = px(a[1], a[2]), [x2, y2] = px(b[1], b[2]), [x3, y3] = px(c[1], c[2])
      // one polygon per triangle: a single path would let opposite windings cancel out
      d += `<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}"/>`
    }
    // body and bands first (underneath), lettering on top
    const group = `<g fill="${fill}">${d}</g>`
    polys = isBody || isBands ? group + polys : polys + group
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${polys}</svg>`
await sharp(Buffer.from(svg)).png().toFile(process.argv[2])

// anchor positions as fractions of the image, for the layout
const anchors = CALLOUTS.map((c) => {
  const t = (c.theta * Math.PI) / 180
  const [x, y] = px(0.4 + Math.sin(t) * c.r, Math.cos(t) * c.r)
  return { id: c.id, label: c.label, x: x / S, y: y / S }
})
writeFileSync(process.argv[2].replace(/\.png$/, '.json'), JSON.stringify(anchors, null, 2))
console.log('ok', anchors.length)
