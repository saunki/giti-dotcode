import * as THREE from 'three'

// Object-space triplanar projection for MeshPhysicalMaterial, mirroring the Redshift
// TriPlanar node the C4D materials use (same image on every axis, sharp 0.1 blend).
// Textures are projected from position instead of UVs, so they tile at a real size
// (e.g. 50 cm) with no stretching across the tire. The projection uses each mesh's own
// space (in metres), so the texture is stuck to the surface and turns with the tire as it
// rolls; a world-space projection would stay put while the tire spins underneath it.
//
// options:
//   tileSize      metres per texture repeat (C4D "size in cm" / 100)
//   sharpness     blend exponent between the three projections
//   roughness     { map, min, max }      roughness = mix(min, max, map.g)
//   normal        { map, strength }      tangent-space normal map, whiteout-blended
//   detail        { map, tileSize, strength }  second normal map for fine grain
//   baseMix       { map, colorA, colorB, fresnel }  base color = mix(A, B, map.r * fresnel)

export function applyTriplanar(material, options) {
  const {
    tileSize = 0.5,
    sharpness = 6,
    roughness,
    normal,
    detail,
    baseMix,
  } = options

  const uniforms = {
    triScale: { value: 1 / tileSize },
    triSharpness: { value: sharpness },
  }
  const defines = []

  if (roughness) {
    uniforms.triRoughMap = { value: roughness.map }
    uniforms.triRoughRange = { value: new THREE.Vector2(roughness.min, roughness.max) }
    defines.push('TRI_ROUGHNESS')
  }
  if (normal) {
    uniforms.triNormalMap = { value: normal.map }
    uniforms.triNormalStrength = { value: normal.strength }
    defines.push('TRI_NORMAL')
  }
  if (detail) {
    uniforms.triDetailMap = { value: detail.map }
    uniforms.triDetailScale = { value: 1 / detail.tileSize }
    uniforms.triDetailStrength = { value: detail.strength }
    defines.push('TRI_DETAIL')
  }
  if (baseMix) {
    uniforms.triBaseMixMap = { value: baseMix.map }
    uniforms.triColorA = { value: baseMix.colorA }
    uniforms.triColorB = { value: baseMix.colorB }
    uniforms.triFresnel = { value: baseMix.fresnel ? 1 : 0 }
    defines.push('TRI_BASEMIX')
  }

  material.userData.triplanar = uniforms
  material.customProgramCacheKey = () => `triplanar:${defines.join(',')}`

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    const defineBlock = defines.map((d) => `#define ${d}`).join('\n')

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vTriPos;
        varying vec3 vTriNormal;
        varying vec3 vTriAxisX;
        varying vec3 vTriAxisY;
        varying vec3 vTriAxisZ;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        {
          vec3 ax = modelMatrix[0].xyz, ay = modelMatrix[1].xyz, az = modelMatrix[2].xyz;
          // object space, scaled to metres so tile sizes stay real-world
          vTriPos = transformed * vec3(length(ax), length(ay), length(az));
          vTriNormal = normalize(objectNormal);
          // the mesh's axes in world space (object -> world rotation), for the normals
          vTriAxisX = normalize(ax);
          vTriAxisY = normalize(ay);
          vTriAxisZ = normalize(az);
        }`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${defineBlock}
        varying vec3 vTriPos;
        varying vec3 vTriNormal;
        varying vec3 vTriAxisX;
        varying vec3 vTriAxisY;
        varying vec3 vTriAxisZ;
        uniform float triScale;
        uniform float triSharpness;
        #ifdef TRI_ROUGHNESS
          uniform sampler2D triRoughMap;
          uniform vec2 triRoughRange;
        #endif
        #ifdef TRI_NORMAL
          uniform sampler2D triNormalMap;
          uniform float triNormalStrength;
        #endif
        #ifdef TRI_DETAIL
          uniform sampler2D triDetailMap;
          uniform float triDetailScale;
          uniform float triDetailStrength;
        #endif
        #ifdef TRI_BASEMIX
          uniform sampler2D triBaseMixMap;
          uniform vec3 triColorA;
          uniform vec3 triColorB;
          uniform float triFresnel;
        #endif

        vec3 triWeights(vec3 n) {
          vec3 w = pow(abs(n), vec3(triSharpness));
          return w / (w.x + w.y + w.z);
        }
        vec4 triSample(sampler2D tex, vec3 p, vec3 w, float s) {
          return texture2D(tex, p.zy * s) * w.x
               + texture2D(tex, p.xz * s) * w.y
               + texture2D(tex, p.xy * s) * w.z;
        }
        // Whiteout-blended triplanar normal mapping (object space in, object space out)
        vec3 triNormal(sampler2D tex, vec3 p, vec3 n, vec3 w, float s, float strength) {
          vec3 tx = texture2D(tex, p.zy * s).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(tex, p.xz * s).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(tex, p.xy * s).xyz * 2.0 - 1.0;
          tx.xy *= strength; ty.xy *= strength; tz.xy *= strength;
          tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x);
          ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y);
          tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
          return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        #ifdef TRI_ROUGHNESS
          vec3 triW0 = triWeights(normalize(vTriNormal));
          roughnessFactor = mix(triRoughRange.x, triRoughRange.y, triSample(triRoughMap, vTriPos, triW0, triScale).g);
        #endif`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // view-space shading normal -> world (viewMatrix is orthonormal) -> the mesh's own
          // space, where the textures are projected; back the same way afterwards
          mat3 triToWorld = mat3(normalize(vTriAxisX), normalize(vTriAxisY), normalize(vTriAxisZ));
          vec3 triN = normalize((vec4(normal, 0.0) * viewMatrix).xyz) * triToWorld;
          vec3 triW = triWeights(triN);
          #ifdef TRI_NORMAL
            triN = triNormal(triNormalMap, vTriPos, triN, triW, triScale, triNormalStrength);
          #endif
          #ifdef TRI_DETAIL
            triN = triNormal(triDetailMap, vTriPos, triN, triW, triDetailScale, triDetailStrength);
          #endif
          normal = normalize((viewMatrix * vec4(triToWorld * triN, 0.0)).xyz);

          #ifdef TRI_BASEMIX
            float triMask = triSample(triBaseMixMap, vTriPos, triW, triScale).r;
            if (triFresnel > 0.5) {
              // Redshift Fresnel node, IOR 1.5, facing 0 -> perpendicular 1
              float cosT = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
              float f0 = 0.04;
              triMask *= f0 + (1.0 - f0) * pow(1.0 - cosT, 5.0);
            }
            diffuseColor.rgb = mix(triColorA, triColorB, clamp(triMask, 0.0, 1.0));
          #endif
        }`,
      )
  }
  material.needsUpdate = true
  return material
}
