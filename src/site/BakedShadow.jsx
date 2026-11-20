import { useMemo } from 'react'
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { assetUrl } from '../assets.js'

// The tire's floor shadow, baked in Redshift from the C4D scene (same lights, dome and GI).
//
// How it was made (C4d/shadow_bake/): a copy of the scene with the backdrop swapped for a
// flat grey floor, an orthographic camera looking straight down, rendered twice in raw
// linear colour: once with the tire hidden from the camera but still casting shadows and
// bounce light, once without the tire. Their ratio is how much light the tire takes away
// from each point of the floor: 1 = untouched, 0 = the contact patch.
//
// The tire only spins in place and is round, so this shadow is right at every roll angle
// and camera tilt; the floor slides underneath while this plane stays with the wheel.
// It multiplies whatever the floor rendered there.

const SIZE = 3.075 // m covered by the 1024 px bake (calibrated with markers), centred on the wheel

const material = (map, strength) =>
  new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, strength: { value: strength } },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.MultiplyBlending,
    toneMapped: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float strength;
      varying vec2 vUv;
      void main() {
        float r = texture2D(map, vUv).r; // linear light ratio
        // fade to "no shadow" at the bake's edges so the plane has no visible border
        float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        r = max(mix(1.0, r, smoothstep(0.0, 0.14, edge) * strength), 0.0);
        // the framebuffer holds display (sRGB) values: multiply by the ratio in that space
        gl_FragColor = vec4(vec3(pow(r, 1.0 / 2.2)), 1.0);
      }`,
  })

export default function BakedShadow({ position = [0, 0, 0], strength = 1 }) {
  const map = useLoader(THREE.TextureLoader, assetUrl('textures/tire_shadow.png'))
  const mat = useMemo(() => {
    map.colorSpace = THREE.NoColorSpace // data, not colour
    map.anisotropy = 8
    return material(map, strength)
  }, [map, strength])
  return (
    // image up = C4D +Z = three.js -Z; rotating the plane flat maps its +Y to -Z
    <mesh name="bakedShadow" position={[position[0], 0.002, position[2]]} rotation-x={-Math.PI / 2} material={mat} renderOrder={1}>
      <planeGeometry args={[SIZE, SIZE]} />
    </mesh>
  )
}
