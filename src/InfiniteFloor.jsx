import { useMemo } from 'react'
import * as THREE from 'three'

// Endless studio floor in the C4D concrete, replacing the curved backdrop.
//
// The concrete is a single ~9.5 m image (it spanned the backdrop once in C4D), so plain
// tiling would show an obvious grid. Each sample is taken twice with pseudo-random
// per-region offsets and blended (Inigo Quilez, "texture repetition", technique 3),
// which hides the repeat without visible seams. Fog fades the far floor into the
// background colour, so there is no horizon line.

const TILE = 9.5 // metres per texture repeat, matching the backdrop's UV span in C4D
// the repeat-hiding noise below tiles every 10 texture repeats (13 noise cells at 1.3 per
// repeat), so the floor can be shifted by whole periods without a visible jump
export const FLOOR_PERIOD = 10 * TILE
const SIZE = 400 // metres; far beyond the fog distance

const NO_TILE_GLSL = /* glsl */ `
  float ntHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ntNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(ntHash(mod(i, 13.0)), ntHash(mod(i + vec2(1, 0), 13.0)), f.x),
               mix(ntHash(mod(i + vec2(0, 1), 13.0)), ntHash(mod(i + vec2(1, 1), 13.0)), f.x), f.y);
  }
  vec4 textureNoTile(sampler2D samp, vec2 uv) {
    float l = ntNoise(uv * 1.3) * 8.0;
    float i = floor(l);
    float f = fract(l);
    vec2 offA = sin(vec2(3.0, 7.0) * i);
    vec2 offB = sin(vec2(3.0, 7.0) * (i + 1.0));
    vec2 dx = dFdx(uv), dy = dFdy(uv);
    vec4 a = textureGrad(samp, uv + offA, dx, dy);
    vec4 b = textureGrad(samp, uv + offB, dx, dy);
    return mix(a, b, smoothstep(0.2, 0.8, f - 0.1 * dot(a.rgb - b.rgb, vec3(1.0))));
  }
`

function noTileMaterial(source) {
  const material = source.clone()
  for (const key of ['map', 'roughnessMap', 'normalMap']) {
    if (!material[key]) continue
    const t = material[key].clone()
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(SIZE / TILE, SIZE / TILE)
    t.needsUpdate = true
    material[key] = t
  }
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NO_TILE_GLSL}`)
      .replace(
        '#include <map_fragment>',
        THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )', 'textureNoTile( map, vMapUv )'),
      )
      .replace(
        '#include <roughnessmap_fragment>',
        THREE.ShaderChunk.roughnessmap_fragment.replace(
          'texture2D( roughnessMap, vRoughnessMapUv )',
          'textureNoTile( roughnessMap, vRoughnessMapUv )',
        ),
      )
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replaceAll(
          'texture2D( normalMap, vNormalMapUv )',
          'textureNoTile( normalMap, vNormalMapUv )',
        ),
      )
  }
  material.customProgramCacheKey = () => 'concrete-no-tile'
  return material
}

export default function InfiniteFloor({ material }) {
  const floorMaterial = useMemo(() => noTileMaterial(material), [material])
  return (
    <mesh rotation-x={-Math.PI / 2} material={floorMaterial} userData={{ noContactShadow: true }}>
      <planeGeometry args={[SIZE, SIZE]} />
    </mesh>
  )
}
