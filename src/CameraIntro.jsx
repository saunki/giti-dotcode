import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Opening shot: starts in a tight close-up on the tire, holds a beat, then arcs
// around and pulls back to the default camera. Orbit controls are off while it runs;
// any key or click skips straight to the end.
//
// The move is interpolated in spherical coordinates around the orbit target, so the
// camera swings around the tire instead of cutting a straight line through space.

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) // easeInOutCubic

export default function CameraIntro({
  startDistance = 2.6, // metres; with the 100 mm lens this frames the tread and rim
  startAzimuthOffset = 0.8, // radians around the tire relative to the final view (towards the rim face)
  // same height angle as the final view: the sightline then passes over the 0.7 m elephants
  startPolarOffset = 0, // radians lower (closer to the floor) than the final view
  hold = 0.6, // seconds on the close-up before moving
  duration = 4.2, // seconds for the move
}) {
  const { camera, controls } = useThree()
  const anim = useRef(null)
  // the final framing, captured once: StrictMode re-runs the effect below, and by then
  // the camera already sits at the close-up
  const finalView = useRef(null)

  // capture the final framing and jump to the close-up before the first frame renders
  useLayoutEffect(() => {
    if (!controls) return
    finalView.current ??= { position: camera.position.clone(), target: controls.target.clone() }
    const target = finalView.current.target.clone()
    const end = new THREE.Spherical().setFromVector3(finalView.current.position.clone().sub(target))
    const start = new THREE.Spherical(
      startDistance,
      THREE.MathUtils.clamp(end.phi + startPolarOffset, 0.2, Math.PI / 2 - 0.08),
      end.theta + startAzimuthOffset,
    )
    anim.current = { target, start, end, t: -hold, done: false }
    camera.position.copy(new THREE.Vector3().setFromSpherical(start).add(target))
    camera.lookAt(target)
    controls.enabled = false
  }, [controls, camera, startDistance, startAzimuthOffset, startPolarOffset, hold])

  const finish = () => {
    const a = anim.current
    if (!a || a.done) return
    a.t = duration
  }

  useEffect(() => {
    window.addEventListener('keydown', finish)
    window.addEventListener('pointerdown', finish)
    return () => {
      window.removeEventListener('keydown', finish)
      window.removeEventListener('pointerdown', finish)
    }
  })

  useFrame((_, dt) => {
    const a = anim.current
    if (!a || a.done || !controls) return
    a.t += Math.min(dt, 1 / 30)
    const k = ease(THREE.MathUtils.clamp(a.t / duration, 0, 1))
    // the orbit target can move (the tire may already be rolling); follow it
    const target = controls.target
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(a.start.radius, a.end.radius, k),
      THREE.MathUtils.lerp(a.start.phi, a.end.phi, k),
      THREE.MathUtils.lerp(a.start.theta, a.end.theta, k),
    )
    camera.position.copy(new THREE.Vector3().setFromSpherical(s).add(target))
    camera.lookAt(target)
    if (a.t >= duration) {
      a.done = true
      controls.enabled = true
      controls.update()
    }
  })

  return null
}
