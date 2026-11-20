import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { createMaterials } from '../materials.js'
import BakedShadow from './BakedShadow.jsx'
import InfiniteFloor, { FLOOR_PERIOD } from '../InfiniteFloor.jsx'
import { preloadAssets, useGLTFAsset, useHDRAsset } from '../assets.js'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { SIDEWALL_X, WHEEL_CENTER, WHEEL_RADIUS, wheelState } from './wheel.js'
import { CALLOUTS } from './content.js'
import { useTuning } from './tuning.js'

RectAreaLightUniformsLib.init()

// Same studio as the playground (C4D area lights + dome HDRI), but the tire only rolls
// in place: scrolling turns it around its axle and slides the floor underneath, so it
// looks like it drives forward and back while the camera stays put.

// [name, position, direction, width, height, colour, intensity]; colour, intensity and a
// turn around the tire are live-tunable (tuning.js), from this base placement
const AREA_LIGHTS = [
  ['Rim', [0.2, 1.197, -0.852], [0, 0, 1], 0.11, 0.11, '#fccf00', 12],
  ['Rim.1', [0.676, 0.111, -0.208], [-0.664, 0.64, 0.387], 0.425, 0.11, '#fccf00', 3],
  ['Rim.2', [0.495, 0.414, 0.218], [-0.143, 0.981, -0.132], 0.755, 0.11, '#fccf00', 3],
  ['Side', [0.606, 0.821, -0.19], [-1, 0, 0], 0.51, 0.286, '#ffffff', 3],
]

function AreaLights() {
  const lights = useMemo(
    () =>
      AREA_LIGHTS.map(([name, p, d, w, h, color, intensity]) => {
        const light = new THREE.RectAreaLight(color, intensity, w, h)
        light.name = name
        light.position.set(...p)
        const target = [p[0] + d[0], p[1] + d[1], p[2] + d[2]]
        light.lookAt(...target)
        light.userData.base = { position: p, target }
        return light
      }),
    [],
  )
  return lights.map((l, i) => <primitive key={i} object={l} />)
}

const MODEL = 'models/tire.glb'
const HDRI = 'hdri/studio_2k.hdr'
const extendLoader = (loader) => loader.setMeshoptDecoder(MeshoptDecoder)

function Wheel({ materials, pivotRef }) {
  const { scene } = useGLTFAsset(MODEL, extendLoader)
  const roll = useRef()

  const wheel = useMemo(() => {
    scene.traverse((obj) => {
      if (!obj.isMesh) return
      const replacement = materials[obj.material.name]
      if (replacement) obj.material = replacement
    })
    // taken out of the glTF scene once (StrictMode runs this memo twice)
    if (!scene.userData.wheel) {
      const w = scene.getObjectByName('Wheelv3')
      w.removeFromParent()
      w.position.set(0, 0, 0) // centred in the roll group, which sits at the wheel centre
      scene.userData.wheel = w
    }
    return scene.userData.wheel
  }, [scene, materials])

  // Callout anchors on the real surface: for each piece of lettering, shoot a ray at the
  // outer sidewall (wheel frame, straight along the axle) and keep the hit point. The
  // sidewall bulges, so a flat plane drifts off the letters once the camera swings.
  // A BVH makes these rays, and the per-frame occlusion rays in Callouts.jsx, cheap.
  useLayoutEffect(() => {
    const group = roll.current
    const meshes = []
    wheel.traverse((o) => {
      if (!o.isMesh) return
      o.geometry.boundsTree ??= new MeshBVH(o.geometry)
      o.raycast = acceleratedRaycast
      meshes.push(o)
    })
    group.updateMatrixWorld(true)
    const ray = new THREE.Raycaster()
    ray.firstHitOnly = true
    const anchors = {}
    for (const c of CALLOUTS) {
      const t = (c.theta * Math.PI) / 180
      const origin = group.localToWorld(new THREE.Vector3(1, Math.sin(t) * c.r, Math.cos(t) * c.r))
      const dir = new THREE.Vector3(-1, 0, 0).transformDirection(group.matrixWorld)
      ray.set(origin, dir)
      const hit = ray.intersectObjects(meshes, false)[0]
      anchors[c.id] = hit
        ? group.worldToLocal(hit.point.clone())
        : new THREE.Vector3(SIDEWALL_X, Math.sin(t) * c.r, Math.cos(t) * c.r)
    }
    Object.assign(wheelState, { roll: group, meshes, anchors })
    return () => Object.assign(wheelState, { roll: null, meshes: null, anchors: null })
  }, [wheel])

  useFrame(() => {
    roll.current.rotation.x = wheelState.angle
    roll.current.updateMatrixWorld(true) // the callouts read it this frame, before render
  })

  return (
    <group ref={pivotRef} position={[0, 0, 0]}>
      <group ref={roll} position={WHEEL_CENTER}>
        <primitive object={wheel} />
      </group>
    </group>
  )
}

// floor slides under the wheel: distance = angle x radius, so the tread never skids
function RollingFloor({ material }) {
  const ref = useRef()
  useFrame(() => {
    // wrapped by whole floor periods: the wheel rolls forever, the floor mesh stays put
    const d = wheelState.angle * WHEEL_RADIUS
    ref.current.position.z = -(((d % FLOOR_PERIOD) + FLOOR_PERIOD) % FLOOR_PERIOD)
  })
  return (
    <group ref={ref}>
      <InfiniteFloor material={material} />
    </group>
  )
}

export default function SiteScene() {
  const { gl } = useThree()
  const materials = useMemo(createMaterials, [])
  const pivotRef = useRef()
  const hdri = useHDRAsset(HDRI)
  const hdriChoice = useTuning((t) => t.env.hdri) // 'c4d' or a drei preset (look dev)
  // tone mapping and exposure come from the look settings (TuningApplier)

  return (
    <>
      {hdriChoice === 'c4d' ? (
        <Environment map={hdri} environmentIntensity={1} environmentRotation={[0, 1.2566, 0]} />
      ) : (
        <Environment preset={hdriChoice} environmentIntensity={1} environmentRotation={[0, 1.2566, 0]} />
      )}
      <AreaLights />
      <Wheel materials={materials} pivotRef={pivotRef} />
      <RollingFloor material={materials['Concrete Surface Polished 001 Neutral 400cm']} />
      {/* Redshift-baked floor shadow (see BakedShadow.jsx) */}
      <BakedShadow />
    </>
  )
}

preloadAssets({ gltf: MODEL, hdr: HDRI, configure: extendLoader })
