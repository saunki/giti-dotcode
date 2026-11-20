import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { changed, tuning } from './tuning.js'

// Applies the look settings (tuning.js) to the scene every frame. Cheap:
// a handful of property writes; materials are only recompiled when the tone mapping
// operator changes.

const DEG = Math.PI / 180
export const TONE_MAPPINGS = {
  AgX: THREE.AgXToneMapping,
  'ACES Filmic': THREE.ACESFilmicToneMapping,
  Neutral: THREE.NeutralToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  None: THREE.NoToneMapping,
}

const axisY = new THREE.Vector3(0, 1, 0)
const p = new THREE.Vector3()
const target = new THREE.Vector3()

export default function TuningApplier() {
  const { scene, gl } = useThree()
  const cache = useRef({ lights: [], materials: [], shadow: null })

  useFrame(() => {
    const c = cache.current
    const t = tuning

    // find things once they exist (the scene loads asynchronously)
    if (!c.lights.length) c.lights = scene.getObjectsByProperty('isRectAreaLight', true)
    if (!c.shadow) c.shadow = scene.getObjectByName('bakedShadow')
    if (!c.materials.length) {
      const found = new Set()
      scene.traverse((o) => o.isMesh && o.material?.isMeshStandardMaterial && o.material.name && found.add(o.material))
      c.materials = [...found]
      let added = false
      for (const m of c.materials) {
        if (t.materials[m.name]) continue
        t.materials[m.name] = { envMapIntensity: m.envMapIntensity, color: `#${m.color.getHexString()}` }
        if (m.clearcoat > 0) t.materials[m.name].clearcoat = m.clearcoat
        added = true
      }
      if (added) changed() // lets the panel build its material folders
    }

    // lights: each one turns around the tire (vertical axis through the wheel), with the
    // group rotation on top; aim is kept relative to the light
    for (const light of c.lights) {
      const s = t.lights[light.name]
      const base = light.userData.base
      if (!s || !base) continue
      light.visible = s.on
      light.intensity = s.intensity
      light.color.set(s.color)
      const a = (t.lights.rotation + s.rotation) * DEG
      light.position.copy(p.fromArray(base.position).applyAxisAngle(axisY, a))
      light.lookAt(target.fromArray(base.target).applyAxisAngle(axisY, a))
    }

    // HDRI
    scene.environmentIntensity = t.env.intensity
    scene.environmentRotation.set(0, t.env.rotation * DEG, 0)

    // baked shadow (local Z is world Y once the plane is laid flat)
    if (c.shadow) {
      c.shadow.material.uniforms.strength.value = t.shadow.strength
      c.shadow.rotation.z = t.shadow.rotation * DEG
    }

    // tone mapping: changing the operator means recompiling the materials
    const tone = TONE_MAPPINGS[t.tone.mapping] ?? THREE.AgXToneMapping
    if (gl.toneMapping !== tone) {
      gl.toneMapping = tone
      scene.traverse((o) => o.material && (o.material.needsUpdate = true))
    }
    gl.toneMappingExposure = t.tone.exposure

    // materials (several meshes can share a name, e.g. the floor's no-tile copy)
    for (const m of c.materials) {
      const s = t.materials[m.name]
      if (!s) continue
      m.envMapIntensity = s.envMapIntensity
      m.color.set(s.color)
      if (s.clearcoat !== undefined) m.clearcoat = s.clearcoat
    }

    // background + fog
    if (scene.background?.isColor) scene.background.set(t.scene.background)
    if (scene.fog) {
      scene.fog.color.set(t.scene.background)
      scene.fog.near = t.scene.fogNear
      scene.fog.far = t.scene.fogFar
    }
    document.body.style.background = t.scene.background
  })
  return null
}
