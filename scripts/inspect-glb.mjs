// Usage: node scripts/inspect-glb.mjs <file.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();

const walk = (node, depth) => {
  const mesh = node.getMesh();
  const info = mesh
    ? mesh.listPrimitives().map((p) => {
        const idx = p.getIndices();
        const tris = (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
        return `${p.getMaterial()?.getName() ?? 'none'}:${tris}t[${p.listSemantics().join(',')}]`;
      }).join(' ')
    : '';
  const t = node.getTranslation().map((v) => +v.toFixed(2));
  console.log(`${'  '.repeat(depth)}${node.getName()} t=${t} s=${node.getScale().map((v) => +v.toFixed(3))} ${info}`);
  node.listChildren().forEach((c) => walk(c, depth + 1));
};
root.listScenes().forEach((s) => s.listChildren().forEach((n) => walk(n, 0)));
console.log('materials:', root.listMaterials().map((m) => m.getName()));
console.log('textures:', root.listTextures().length, 'animations:', root.listAnimations().length);
