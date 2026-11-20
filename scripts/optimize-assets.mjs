// Turns the raw Cinema 4D export into web-ready assets in public/.
// Usage: node scripts/optimize-assets.mjs
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, prune, weld, simplifyPrimitive, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC_GLB = 'C4d/export/tire_raw.glb';
const OUT_GLB = 'public/models/tire.glb';
const TEX_DIR = 'C4d/Tire Scene 01/tex';

await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready, MeshoptDecoder.ready]);
await mkdir('public/models', { recursive: true });
await mkdir('public/textures', { recursive: true });

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read(SRC_GLB);

// C4D appends ".1" to the placeholder materials; restore the original names.
for (const m of doc.getRoot().listMaterials()) m.setName(m.getName().replace(/\.\d+$/, ''));

const countTris = () =>
  doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);

// Only these meshes are simplified. The tire meshes rely on C4D phong-break (hard)
// edges; simplifying them merged the split normals and made the flat tread ribs bulge.
const SIMPLIFY = {
  Backdrop: 0.0004,
};

// The rim (RE, exported at subdivision level 2: 553k tris) is smooth and glossy, so a
// plain geometric simplify leaves long triangles whose normals smear into blotchy shading
// on the spokes. It's simplified to a triangle budget with the normals as attributes, so
// edges are only collapsed where the shading stays the same.
const RIM = {
  node: 'RE',
  triangles: Number(process.env.RIM_TRIS ?? 140000),
  normalWeight: Number(process.env.RIM_NORMAL_WEIGHT ?? 1),
};

function simplifyKeepingShading(prim, { triangles, normalWeight }) {
  const positions = Float32Array.from(prim.getAttribute('POSITION').getArray());
  const normals = Float32Array.from(prim.getAttribute('NORMAL').getArray());
  const indices = Uint32Array.from(prim.getIndices().getArray());
  const [simplified, error] = MeshoptSimplifier.simplifyWithAttributes(
    indices, positions, 3, normals, 3, [normalWeight, normalWeight, normalWeight], null,
    Math.min(indices.length, triangles * 3), 0.01, ['LockBorder'],
  );
  prim.getIndices().setArray(simplified);
  compactPrimitive(prim);
  console.log(`rim: ${indices.length / 3} -> ${simplified.length / 3} tris (error ${error.toFixed(5)})`);
}

console.log('triangles before:', countTris());
await doc.transform(
  dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE] }), // keep placeholder materials distinct
  weld(), // only merges vertices whose normals/UVs are identical, so hard edges survive
);
for (const node of doc.getRoot().listNodes()) {
  if (node.getName() === RIM.node && node.getMesh()) {
    for (const prim of node.getMesh().listPrimitives()) simplifyKeepingShading(prim, RIM);
    continue;
  }
  const error = SIMPLIFY[node.getName()];
  if (!error || !node.getMesh()) continue;
  for (const prim of node.getMesh().listPrimitives()) {
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error, lockBorder: true });
  }
}
await doc.transform(
  prune({ keepAttributes: true }), // UVs are used by textures assigned in the app
  // 'medium' keeps normals at 12-bit; 'high' caps them at 8-bit, which shows as faceting on flat tread
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeNormal: 12 }),
);
console.log('triangles after:', countTris());
await io.write(OUT_GLB, doc);

// Textures: 4k -> 2k (normals 2k too), JPEG for color/scalar data.
const textures = [
  ['mxn_rubber_glossy-001_4k_normal.jpg', 'rubber_normal.jpg'],
  ['mxn_rubber_glossy-001_4k_roughness.jpg', 'rubber_roughness.jpg'],
  ['mxn_rubber_glossy-001_4k_basecolor_mix.jpg', 'rubber_basecolor.jpg'],
  ['mxn_metal_aluminium_anodized-001_4k_roughness.jpg', 'alu_roughness.jpg'],
  ['mxn_concrete_surface_polished-001_4k_basecolormask.png', 'concrete_basecolor.jpg'],
  ['mxn_concrete_surface_polished-001_4k_normal.png', 'concrete_normal.jpg'],
  ['mxn_concrete_surface_polished-001_4k_roughness.png', 'concrete_roughness.jpg'],
  ['Lines.png', 'lines.jpg'],
];
// Bakes the C4D "neutral" ramp + colour correction of the concrete basecolormask.
// Ramp knots (linear grey): mask 0 -> 0.119, 0.185 -> 0.125, 1 -> 0.214, then gamma 1.796.
// Everything below 18.5% (the scratch swirls) collapses to one tone; only the bright
// clouds vary. Output is relative brightness in sRGB; the material colour sets the tint.
async function concreteRamp(img) {
  const { data, info } = await img.grayscale().raw().toBuffer({ resolveWithObject: true });
  const ramp = (m) => (m < 0.185 ? 0.119 + (m / 0.185) * 0.006 : 0.125 + ((m - 0.185) / 0.815) * 0.089);
  const top = Math.pow(0.214, 1 / 1.796);
  const lut = Array.from({ length: 256 }, (_, i) => {
    const rel = Math.pow(ramp(i / 255), 1 / 1.796) / top; // 0.72..1, linear
    return Math.round(255 * (rel <= 0.0031308 ? rel * 12.92 : 1.055 * Math.pow(rel, 1 / 2.4) - 0.055));
  });
  for (let i = 0; i < data.length; i++) data[i] = lut[data[i]];
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } });
}

for (const [src, dst] of textures) {
  let img = sharp(`${TEX_DIR}/${src}`).resize(2048, 2048, { fit: 'inside' }).removeAlpha();
  if (dst === 'concrete_basecolor.jpg') img = await concreteRamp(img);
  await img.jpeg({ quality: 88, mozjpeg: true }).toFile(`public/textures/${dst}`);
}
console.log('textures written');

// Fine-grain normal map standing in for the two Maxon Noise bumps on the rubber
// (bump blender weights 0.14 / 0.25). Tileable fBm value noise -> height -> normals.
{
  const N = 1024;
  const height = new Float32Array(N * N);
  let seed = 233;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [cells, amp] of [[256, 1], [128, 0.55], [64, 0.3], [32, 0.15]]) {
    const grid = Float32Array.from({ length: cells * cells }, rand);
    const g = (x, y) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)];
    const step = N / cells;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const gx = x / step, gy = y / step;
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        let fx = gx - x0, fy = gy - y0;
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        const top = g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx;
        const bottom = g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx;
        height[y * N + x] += amp * (top * (1 - fy) + bottom * fy);
      }
    }
  }
  const px = Buffer.alloc(N * N * 3);
  const h = (x, y) => height[((y + N) % N) * N + ((x + N) % N)];
  const k = 6; // slope strength baked into the map; tuned further via normal strength
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * k;
      const dy = (h(x, y + 1) - h(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 3;
      px[i] = Math.round((-dx / len * 0.5 + 0.5) * 255);
      px[i + 1] = Math.round((-dy / len * 0.5 + 0.5) * 255);
      px[i + 2] = Math.round((1 / len * 0.5 + 0.5) * 255);
    }
  }
  await sharp(px, { raw: { width: N, height: N, channels: 3 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile('public/textures/grain_normal.jpg');
  console.log('grain normal written');
}
