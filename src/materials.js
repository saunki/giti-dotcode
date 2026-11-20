import * as THREE from 'three'
import { applyTriplanar } from './triplanar.js'

// Recreations of the Redshift materials from "Tire Scene 01.c4d".
// Values come from the C4D node graphs (linear colours). The rubber and aluminium use
// the same world-space triplanar projection as Redshift; the concrete has its
// triplanar switch off in C4D, so it stays on UVs.

const loader = new THREE.TextureLoader()

function tex(name, { repeat = 1, srgb = false } = {}) {
  const t = loader.load(`${import.meta.env.BASE_URL}textures/${name}`)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  return t
}

const linear = (r, g = r, b = r) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace)

export function createMaterials() {
  const rubberNormal = tex('rubber_normal.jpg')
  const rubberRoughness = tex('rubber_roughness.jpg')
  const rubberBaseMix = tex('rubber_basecolor.jpg')
  const grain = tex('grain_normal.jpg')

  // Shared rubber look ("settings" group: colour 0.033, size 50 cm).
  // Base colour: 0.033 mixed toward a desaturated, gamma-lifted copy by basecolor_mix x Fresnel.
  // Roughness: the glossy-rubber map (0.01..0.76, mean 0.16); the satin look in the render
  // comes from the fine noise bumps, reproduced here by the grain normal map.
  const rubberTriplanar = (extra = {}) => ({
    tileSize: 0.5,
    // floor raised from the map's raw 0.01 so the rubber never reads as polished metal
    roughness: { map: rubberRoughness, min: 0.22, max: 0.8 },
    normal: { map: rubberNormal, strength: 0.6 },
    detail: { map: grain, tileSize: 0.05, strength: 0.18 },
    baseMix: { map: rubberBaseMix, colorA: linear(0.033), colorB: linear(0.075), fresnel: true },
    ...extra,
  })

  const rubberGlossy = applyTriplanar(
    new THREE.MeshPhysicalMaterial({
      name: 'Rubber Glossy',
      color: linear(0.033),
      roughness: 0.3,
      specularIntensity: 0.65,
      envMapIntensity: 0.75,
    }),
    rubberTriplanar(),
  )

  // "Rubber Lines mat": same rubber, plus Lines.png on UVs as bump (scale 6 in C4D, 3 here by request), base roughness 0.79.
  const rubberLines = applyTriplanar(
    new THREE.MeshPhysicalMaterial({
      name: 'Rubber Lines',
      color: linear(0.033),
      bumpMap: tex('lines.jpg', { repeat: 3 }),
      bumpScale: 1,
      specularIntensity: 0.65,
      envMapIntensity: 0.75,
    }),
    rubberTriplanar({ roughness: { map: rubberRoughness, min: 0.55, max: 0.95 } }),
  )

  // "Rubber mat": raised sidewall lettering, plain RS Standard (0.029, roughness 0.882).
  const rubberMatte = new THREE.MeshPhysicalMaterial({
    name: 'Rubber Matte',
    color: linear(0.029),
    roughness: 0.88,
  })

  // "Aluminium Anodized 001 Black 100cm": metalness 1, colour 0.081 weighted by the
  // roughness ramp (~0.3) -> very dark F0; roughness = mix(0.23, map, 0.37) + smudges.
  const aluminium = applyTriplanar(
    new THREE.MeshPhysicalMaterial({
      name: 'Aluminium Anodized Black',
      color: linear(0.02),
      metalness: 1,
      roughness: 0.3,
      // the HDRI is far brighter than the GI-shadowed wheel well in Redshift; keep the rim near-black
      envMapIntensity: 0.45,
    }),
    {
      tileSize: 1,
      // map values 0.24..0.38 -> 0.23*0.63 + 0.37*map, widened a little for the smudge noise
      roughness: { map: tex('alu_roughness.jpg'), min: 0.12, max: 0.6 },
    },
  )

  // "Concrete Surface Polished 001 Neutral 400cm": warm grey ramp (0.119 -> 0.214, r>g>b)
  // lifted by gamma 1.8, rough base (0.64..0.95) under a full clearcoat.
  const concrete = new THREE.MeshPhysicalMaterial({
    name: 'Concrete Polished',
    color: linear(0.68, 0.655, 0.63),
    map: tex('concrete_basecolor.jpg', { repeat: 1, srgb: true }),
    roughness: 1,
    roughnessMap: tex('concrete_roughness.jpg', { repeat: 1 }),
    normalMap: tex('concrete_normal.jpg', { repeat: 1 }),
    normalScale: new THREE.Vector2(0.25, 0.25),
    clearcoat: 0.35,
    clearcoatRoughness: 0.55,
  })

  return {
    'Rubber Glossy 001 Black 50cm': rubberGlossy,
    'Rubber Lines mat': rubberLines,
    'Rubber mat': rubberMatte,
    'Aluminium Anodized 001 Black 100cm': aluminium,
    'Concrete Surface Polished 001 Neutral 400cm': concrete,
  }
}
