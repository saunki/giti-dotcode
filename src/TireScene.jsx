import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { createMaterials } from './materials.js'
import ContactShadow from './ContactShadow.jsx'
import { preloadAssets, useGLTFAsset, useHDRAsset } from './assets.js'
import { InteractiveTire } from './TireInteractions.jsx'
import Elephants from './Elephants.jsx'
import InfiniteFloor from './InfiniteFloor.jsx'
import { CuboidCollider, Physics, RigidBody } from '@react-three/rapier'

RectAreaLightUniformsLib.init()

// Area lights from the C4D scene (cm -> m, C4D left-handed Z flipped).
// [name, position, direction, width, height, color, intensity]
const AREA_LIGHTS = [
  ['Rim', [0.2, 1.197, -0.852], [0, 0, 1], 0.11, 0.11, '#fccf00', 12],
  ['Rim.1', [0.676, 0.111, -0.208], [-0.664, 0.64, 0.387], 0.425, 0.11, '#fccf00', 3],
  ['Rim.2', [0.495, 0.414, 0.218], [-0.143, 0.981, -0.132], 0.755, 0.11, '#fccf00', 3],
  ['Side', [0.606, 0.821, -0.19], [-1, 0, 0], 0.51, 0.286, '#ffffff', 3],
]

function AreaLight({ position, direction, width, height, color, intensity }) {
  const ref = useMemo(() => {
    const light = new THREE.RectAreaLight(color, intensity, width, height)
    light.position.set(...position)
    light.lookAt(
      position[0] + direction[0],
      position[1] + direction[1],
      position[2] + direction[2],
    )
    return light
  }, [position, direction, width, height, color, intensity])
  return <primitive object={ref} />
}

// relative to the page; parsed from memory (see assets.js)
const MODEL = 'models/tire.glb'
const HDRI = 'hdri/studio_2k.hdr'
// three's own meshopt decoder: drei's default setup took ~30 s on this file, this takes ~20 ms
const extendLoader = (loader) => loader.setMeshoptDecoder(MeshoptDecoder)

function Tire({ materials, pivotRef, onStats }) {
  const { scene } = useGLTFAsset(MODEL, extendLoader)
  // Swap materials before rendering: InteractiveTire's layout effect re-parents the wheel
  // out of `scene`, and child effects run before ours, so an effect here would miss it.
  // GLTFLoader strips the dot from C4D's "Wheel.v3".
  const wheel = useMemo(() => {
    scene.traverse((obj) => {
      if (!obj.isMesh) return
      const replacement = materials[obj.material.name]
      if (replacement) obj.material = replacement
    })
    // the curved C4D backdrop (wall) is replaced by the endless floor
    const backdrop = scene.getObjectByName('Backdrop')
    if (backdrop) backdrop.visible = false
    return scene.getObjectByName('Wheelv3')
  }, [scene, materials])

  return (
    <>
      <primitive object={scene} />
      <InteractiveTire wheel={wheel} pivotRef={pivotRef} onStats={onStats} />
    </>
  )
}

export default function TireScene({ onStats }) {
  const { gl } = useThree()
  const materials = useMemo(createMaterials, [])
  const pivotRef = useRef()
  const hdri = useHDRAsset(HDRI)
  useEffect(() => {
    gl.toneMapping = THREE.AgXToneMapping
    gl.toneMappingExposure = 1.0
  }, [gl])

  return (
    <>
      {/* RS Dome Light: studio HDRI rotated -72 degrees around Y */}
      <Environment
        map={hdri}
        environmentIntensity={1}
        environmentRotation={[0, 1.2566, 0]}
      />
      {AREA_LIGHTS.map(([name, position, direction, w, h, color, intensity]) => (
        <AreaLight
          key={name}
          position={position}
          direction={direction}
          width={w}
          height={h}
          color={color}
          intensity={intensity}
        />
      ))}
      <Physics gravity={[0, -9.81, 0]}>
        <Tire materials={materials} pivotRef={pivotRef} onStats={onStats} />
        <Elephants />
        <InfiniteFloor material={materials['Concrete Surface Polished 001 Neutral 400cm']} />
        {/* physics ground: a thick slab whose top face is y = 0 (the floor mesh is visual only) */}
        <RigidBody type="fixed" colliders={false} friction={0.9}>
          <CuboidCollider args={[200, 0.5, 200]} position={[0, -0.5, 0]} />
        </RigidBody>
      </Physics>
      {/* contact patch + soft occlusion, baked at rest, then follows the tire around */}
      <ContactShadow follow={pivotRef} restY={0.399} />
    </>
  )
}

preloadAssets({ gltf: MODEL, hdr: HDRI, configure: extendLoader })
