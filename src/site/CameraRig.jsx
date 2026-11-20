import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { wheelState } from './wheel.js'

// Camera tilt around the tire, driven by the cursor (inverted: cursor right swings the
// camera left, cursor up swings it down), or by the phone's orientation on touch devices.
// The tilt is an orbit around the render's target point, eased so it floats rather than
// tracks. Held still while the tire is being dragged.

const MAX_TILT = (15 * Math.PI) / 180
const MAX_POLAR = (86 * Math.PI) / 180 // never below the floor's horizon
const GYRO_RANGE = 25 // degrees of phone tilt for full camera tilt

const input = { x: 0, y: 0 } // -1..1; x right, y up

function useTiltInput() {
  useEffect(() => {
    const onMove = (e) => {
      if (e.pointerType === 'touch') return
      input.x = (e.clientX / window.innerWidth) * 2 - 1
      input.y = 1 - (e.clientY / window.innerHeight) * 2
    }
    const onLeave = () => (input.x = input.y = 0)

    // phones: device orientation, relative to how the phone was held at first reading
    let base = null
    const onOrient = (e) => {
      if (e.beta === null || e.gamma === null) return
      base ??= { beta: e.beta, gamma: e.gamma }
      const clamp = (v) => Math.max(-1, Math.min(1, v))
      input.x = clamp((e.gamma - base.gamma) / GYRO_RANGE)
      input.y = clamp((base.beta - e.beta) / GYRO_RANGE)
    }
    const listenOrient = () => window.addEventListener('deviceorientation', onOrient)
    // iOS asks for permission, and only from a tap
    const askOnTap = () => {
      window.removeEventListener('touchend', askOnTap)
      DeviceOrientationEvent.requestPermission?.().then((r) => r === 'granted' && listenOrient()).catch(() => {})
    }
    if (typeof DeviceOrientationEvent !== 'undefined') {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') window.addEventListener('touchend', askOnTap)
      else listenOrient()
    }

    window.addEventListener('pointermove', onMove)
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('deviceorientation', onOrient)
      window.removeEventListener('touchend', askOnTap)
    }
  }, [])
}

export default function CameraRig({ position, target }) {
  const camera = useThree((s) => s.camera)
  useTiltInput()
  const base = useMemo(() => {
    const t = new THREE.Vector3(...target)
    return { target: t, spherical: new THREE.Spherical().setFromVector3(new THREE.Vector3(...position).sub(t)) }
  }, [position, target])
  const tilt = useRef({ yaw: 0, pitch: 0 })
  const s = useMemo(() => new THREE.Spherical(), [])

  useFrame((_, dt) => {
    const t = tilt.current
    if (wheelState.mode !== 'drag') {
      const k = 1 - Math.exp(-dt * 2.5)
      t.yaw += (-input.x * MAX_TILT - t.yaw) * k // inverted: cursor right -> camera left
      t.pitch += (-input.y * MAX_TILT - t.pitch) * k // inverted: cursor up -> camera down
    }
    s.copy(base.spherical)
    s.theta += t.yaw
    s.phi = Math.min(MAX_POLAR, s.phi - t.pitch) // pitch < 0 lowers the camera (larger polar angle)
    camera.position.setFromSpherical(s).add(base.target)
    camera.lookAt(base.target)
  })
  return null
}
