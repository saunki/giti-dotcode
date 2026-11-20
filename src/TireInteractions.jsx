import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { getScore, subscribeScore } from './score.js'

// Playful controls for the tire: roll, steer, drift, jump, barrel-roll, throw.
// The tire's own motion is a small hand-written model (it rolls along its heading,
// sideways slip is damped like rubber grip, gravity + squash on landing). A kinematic
// Rapier cylinder follows it so it can shove the physics props (Elephants.jsx).
//
// The GLB's "Wheel.v3" node is re-parented into pivot -> lean -> roll groups:
//   pivot  position on the floor, heading (yaw), jump height, squash
//   lean   tilt into turns and barrel rolls (around the rolling direction)
//   roll   spin around the axle (world X at rest)

export const WHEEL_RADIUS = 0.4735 // m, from the C4D bounds
const REST_Y = 0.399 // wheel centre in the C4D scene (tread sunk ~7 cm into the floor)
const GRAVITY = 14
const WHEEL_HALF_WIDTH = 0.165 // half the tread width along the axle
// 30 x 30 m arena on the endless floor; the tire bounces off its invisible edges
const BOUNDS = { minX: -15, maxX: 15, minZ: -15, maxZ: 15 }

const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  boost: ['ShiftLeft', 'ShiftRight'],
  drift: ['KeyX'],
}

function useKeys() {
  const pressed = useRef(new Set())
  const taps = useRef([])
  useEffect(() => {
    const down = (e) => {
      if (e.target instanceof HTMLInputElement) return
      if (!pressed.current.has(e.code)) taps.current.push(e.code)
      pressed.current.add(e.code)
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    }
    const up = (e) => pressed.current.delete(e.code)
    const blur = () => pressed.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])
  const is = (action) => KEYS[action].some((k) => pressed.current.has(k))
  const takeTaps = () => taps.current.splice(0)
  return { is, takeTaps }
}

const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const tmp = new THREE.Vector3()

export function InteractiveTire({ wheel, pivotRef, onStats }) {
  const { camera, controls, raycaster, pointer, gl } = useThree()
  const keys = useKeys()
  const lean = useRef()
  const roll = useRef()
  const body = useRef() // kinematic Rapier body mirroring the tire

  // all simulation state lives in a ref: no React re-renders per frame
  const s = useRef({
    vel: new THREE.Vector2(), // world x/z, m/s
    yaw: 0,
    vy: 0,
    y: 0, // height above rest
    spin: 0,
    leanAngle: 0,
    trick: 0, // current barrel-roll angle
    trickTarget: 0,
    jumpsLeft: 2,
    squash: 0,
    squashVel: 0,
    drag: null, // { start, startTime, moved, history }
    airTime: 0,
    bestAir: 0,
    distance: 0,
  })

  // re-parent the GLB wheel into our pivot hierarchy, restore on unmount
  useLayoutEffect(() => {
    if (!wheel || !roll.current) return
    const parent = wheel.parent
    const saved = { position: wheel.position.clone(), quaternion: wheel.quaternion.clone() }
    roll.current.add(wheel)
    wheel.position.set(0, 0, 0)
    return () => {
      parent?.add(wheel)
      wheel.position.copy(saved.position)
      wheel.quaternion.copy(saved.quaternion)
    }
  }, [wheel])

  // hitting a prop costs a little speed and gives a small jolt
  const onHit = ({ other }) => {
    if (other.rigidBodyObject?.userData?.kind !== 'elephant') return
    const st = s.current
    st.vel.multiplyScalar(0.82)
    st.squash = Math.max(st.squash, 0.25)
  }

  const reset = () => {
    const st = s.current
    st.vel.set(0, 0)
    Object.assign(st, { yaw: 0, vy: 0, y: 0, spin: 0, leanAngle: 0, trick: 0, trickTarget: 0, jumpsLeft: 2 })
    pivotRef.current.position.set(0, REST_Y, 0)
  }

  const jump = (power = 4.2) => {
    const st = s.current
    if (st.jumpsLeft <= 0) return
    const grounded = st.y <= 0.001
    st.vy = grounded ? power : power * 0.85
    st.jumpsLeft--
    // second jump in the air does a flip for free
    if (!grounded) st.trickTarget += Math.PI * 2 * (Math.random() < 0.5 ? -1 : 1)
    st.squash = grounded ? -0.5 : st.squash // stretch on take-off
  }

  // pointer: drag the tire to throw it
  const onPointerDown = (e) => {
    e.stopPropagation()
    gl.domElement.setPointerCapture?.(e.pointerId)
    if (controls) controls.enabled = false
    s.current.drag = { startX: e.clientX, startY: e.clientY, startTime: performance.now(), moved: false, history: [] }
  }
  useEffect(() => {
    const up = (e) => {
      const st = s.current
      if (!st.drag) return
      const { history, startTime, startX, startY } = st.drag
      const quick = performance.now() - startTime < 250 && Math.hypot(e.clientX - startX, e.clientY - startY) < 6
      if (quick) {
        // a plain click does nothing; cancel the pull the drag started
        st.vel.set(0, 0)
      } else if (history.length > 1) {
        // throw: velocity from the last ~100 ms of dragging
        const a = history[0]
        const b = history[history.length - 1]
        const dt = Math.max((b.t - a.t) / 1000, 0.016)
        st.vel.set((b.x - a.x) / dt, (b.z - a.z) / dt).clampLength(0, 9)
      }
      st.drag = null
      if (controls) controls.enabled = true
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [controls])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30)
    const st = s.current
    const pivot = pivotRef.current
    if (!pivot) return

    for (const code of keys.takeTaps()) {
      if (code === 'Space') jump()
      if (code === 'KeyR') reset()
      if ((code === 'KeyQ' || code === 'KeyE') && st.y > 0.05) st.trickTarget += Math.PI * 2 * (code === 'KeyQ' ? 1 : -1)
    }

    const forward = tmp.set(-Math.sin(st.yaw), 0, -Math.cos(st.yaw))
    const fwd2 = new THREE.Vector2(forward.x, forward.z)
    const grounded = st.y <= 0.001
    let speedAlong = st.vel.dot(fwd2)

    if (st.drag) {
      // follow the pointer across the floor
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3())
      if (hit) {
        const target = new THREE.Vector2(hit.x, hit.z)
        const pos = new THREE.Vector2(pivot.position.x, pivot.position.z)
        st.vel.copy(target.sub(pos).multiplyScalar(10)).clampLength(0, 9)
        // throw speed comes from the cursor's path on the floor, not the (lagging) tire
        st.drag.history.push({ x: hit.x, z: hit.z, t: performance.now() })
        while (st.drag.history.length > 1 && performance.now() - st.drag.history[0].t > 100) st.drag.history.shift()
      }
    } else {
      // throttle
      const throttle = (keys.is('forward') ? 1 : 0) - (keys.is('back') ? 1 : 0)
      const boost = keys.is('boost') ? 2 : 1
      const maxSpeed = 3.5 * boost
      if (throttle && grounded) {
        const accel = 4.5 * boost * throttle
        if (Math.abs(speedAlong + accel * dt) < maxSpeed) st.vel.addScaledVector(fwd2, accel * dt)
      }
      // steering turns the heading; at speed it also carries the velocity round
      const steer = (keys.is('left') ? 1 : 0) - (keys.is('right') ? 1 : 0)
      if (steer) {
        const rate = 2.2 * THREE.MathUtils.clamp(Math.abs(speedAlong) / 1.2, 0.35, 1) * (speedAlong < -0.1 ? -1 : 1)
        st.yaw += steer * rate * dt
      }
    }

    // tire physics on the ground: rolling resistance + lateral grip (X = drift)
    if (grounded) {
      const lateral = new THREE.Vector2(-fwd2.y, fwd2.x)
      speedAlong = st.vel.dot(fwd2)
      const slip = st.vel.dot(lateral)
      const grip = keys.is('drift') ? 0.8 : 9
      const newSlip = slip * Math.exp(-grip * dt)
      const newAlong = speedAlong * Math.exp(-(st.drag ? 0 : 0.55) * dt)
      st.vel.copy(fwd2.clone().multiplyScalar(newAlong).addScaledVector(lateral, newSlip))
      // a thrown tire turns to face where it is going
      if (st.vel.length() > 0.5 && Math.abs(slip) > 0.3 && !keys.is('drift')) {
        const target = Math.atan2(-st.vel.x, -st.vel.y)
        let diff = target - st.yaw
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        if (Math.abs(diff) > Math.PI / 2) diff = Math.atan2(Math.sin(diff + Math.PI), Math.cos(diff + Math.PI)) // roll backwards instead
        st.yaw += diff * Math.min(1, 6 * dt)
      }
    }

    // integrate position, bounce off the edges of the set
    pivot.position.x += st.vel.x * dt
    pivot.position.z += st.vel.y * dt
    for (const [axis, min, max, comp] of [['x', BOUNDS.minX, BOUNDS.maxX, 'x'], ['z', BOUNDS.minZ, BOUNDS.maxZ, 'y']]) {
      if (pivot.position[axis] < min || pivot.position[axis] > max) {
        pivot.position[axis] = THREE.MathUtils.clamp(pivot.position[axis], min, max)
        st.vel[comp] *= -0.45
        if (grounded && Math.abs(st.vel[comp]) > 1) {
          st.vy = Math.abs(st.vel[comp]) * 0.4
          st.squash = 0.6
        }
      }
    }

    // vertical: gravity, landing squash, small rebound
    st.vy -= GRAVITY * dt
    st.y += st.vy * dt
    if (st.y > 0.001) st.airTime += dt
    if (st.y <= 0) {
      if (st.vy < -2.5) {
        st.squash = Math.min(1, -st.vy / 9)
        st.vy = -st.vy * 0.28
        st.y = 0.0011
      } else {
        st.y = 0
        st.vy = 0
        if (st.airTime > 0) st.bestAir = Math.max(st.bestAir, st.airTime)
        st.airTime = 0
        st.jumpsLeft = 2
        // land a half-finished trick upright
        st.trickTarget = Math.round(st.trick / (Math.PI * 2)) * Math.PI * 2
      }
    }

    // spring for squash & stretch
    st.squashVel += (-st.squash * 180 - st.squashVel * 14) * dt
    st.squash += st.squashVel * dt

    // roll around the axle from distance travelled along the heading
    speedAlong = st.vel.dot(new THREE.Vector2(-Math.sin(st.yaw), -Math.cos(st.yaw)))
    st.spin -= (speedAlong * dt) / WHEEL_RADIUS
    st.distance += Math.abs(speedAlong * dt)

    // lean into turns (centripetal feel) + barrel-roll tricks
    const steerNow = (keys.is('left') ? 1 : 0) - (keys.is('right') ? 1 : 0)
    const leanTarget = grounded ? -steerNow * THREE.MathUtils.clamp(Math.abs(speedAlong) / 4, 0, 1) * 0.22 : 0
    st.leanAngle += (leanTarget - st.leanAngle) * Math.min(1, 8 * dt)
    st.trick += (st.trickTarget - st.trick) * Math.min(1, (grounded ? 12 : 7) * dt)

    pivot.position.y = REST_Y + st.y
    pivot.rotation.y = st.yaw
    const sq = THREE.MathUtils.clamp(st.squash, -0.6, 1)
    pivot.scale.set(1 + sq * 0.06, 1 - sq * 0.12, 1 + sq * 0.06)
    lean.current.rotation.z = st.leanAngle + st.trick
    roll.current.rotation.x = st.spin

    // drive the kinematic collider: heading + lean/trick (the spin doesn't change a cylinder's shape)
    if (body.current) {
      const p = pivot.position
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, st.yaw, st.leanAngle + st.trick, 'YXZ'))
      const from = body.current.translation()
      if (Math.hypot(p.x - from.x, p.z - from.z) > 1) {
        // a teleport (reset): move instantly, otherwise the swept kinematic body
        // would hit anything in between at enormous speed and fling it away
        body.current.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
        body.current.setRotation(q, true)
      } else {
        body.current.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z })
        body.current.setNextKinematicRotation(q)
      }
    }

    // camera follows: move orbit target and camera by the same offset
    // held still while dragging: a moving camera would slide the floor out from under the cursor
    if (controls && !st.drag) {
      // the 100 mm lens frames tightly, so follow height closely or a jump leaves the frame
      const goal = new THREE.Vector3(pivot.position.x, 0.42 + st.y * 0.9, pivot.position.z)
      const delta = goal.sub(controls.target).multiplyScalar(Math.min(1, 6 * dt))
      controls.target.add(delta)
      camera.position.add(delta)
    }

    onStats?.(st)
  })

  return (
    <>
      <group ref={pivotRef} position={[0, REST_Y, 0]} onPointerDown={onPointerDown}>
        <group ref={lean}>
          <group ref={roll} />
        </group>
      </group>
      <RigidBody
        ref={body}
        type="kinematicPosition"
        colliders={false}
        position={[0, REST_Y, 0]}
        onCollisionEnter={onHit}
        userData={{ kind: 'tire' }}
      >
        {/* Rapier cylinders run along Y; turn it so the axle lies along X like the wheel */}
        <CylinderCollider args={[WHEEL_HALF_WIDTH, WHEEL_RADIUS]} rotation={[0, 0, Math.PI / 2]} />
      </RigidBody>
    </>
  )
}

// HTML overlay with the controls and a couple of live numbers. Toggle with H.
export function InteractionHUD({ statsRef }) {
  const [open, setOpen] = useState(true)
  const [stats, setStats] = useState({ speed: 0, best: 0, distance: 0 })
  const [score, setScore] = useState(getScore)

  useEffect(() => {
    const key = (e) => e.code === 'KeyH' && setOpen((o) => !o)
    window.addEventListener('keydown', key)
    const unsubscribe = subscribeScore(setScore)
    const id = setInterval(() => {
      const st = statsRef.current
      if (st) setStats({ speed: st.vel.length() * 3.6, best: st.bestAir, distance: st.distance })
      setScore(getScore()) // lets the combo badge lapse on its own
    }, 120)
    return () => {
      window.removeEventListener('keydown', key)
      unsubscribe()
      clearInterval(id)
    }
  }, [statsRef])

  const row = (k, label) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
      <span style={styles.key}>{k}</span>
      <span>{label}</span>
    </div>
  )

  return (
    <>
      <div style={styles.score}>
        <div style={styles.scoreLabel}>SCORE</div>
        <div style={styles.scoreValue}>{score.score.toLocaleString()}</div>
        {score.combo > 1 && <div style={styles.comboBadge}>combo x{score.combo}</div>}
        <div style={styles.scoreBest}>best {score.best.toLocaleString()}</div>
      </div>
      <div style={styles.wrap}>
        <div style={styles.stats}>
          <span>{stats.speed.toFixed(0)} km/h</span>
          <span>{stats.distance.toFixed(1)} m rolled</span>
          <span>best air {stats.best.toFixed(2)} s</span>
        </div>
        {open ? (
          <div style={styles.panel}>
            {row('W A S D', 'roll & steer')}
            {row('Shift', 'boost')}
            {row('X', 'drift')}
            {row('Space', 'jump (twice = flip)')}
            {row('Q / E', 'barrel roll in the air')}
            {row('Drag', 'grab & throw the tire')}
            {row('R', 'reset tire')}
            {row('T', 'stand the elephants back up')}
            <div style={{ opacity: 0.6, marginTop: 6 }}>H hides this</div>
          </div>
        ) : (
          <div style={{ ...styles.panel, opacity: 0.7 }}>H for controls</div>
        )}
      </div>
    </>
  )
}

const styles = {
  score: {
    position: 'absolute',
    top: 16,
    right: 16,
    minWidth: 140,
    padding: '10px 14px',
    borderRadius: 10,
    background: '#000000',
    color: '#ffe000',
    font: '12px/1.2 system-ui, sans-serif',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  scoreLabel: { letterSpacing: 2, opacity: 0.75, fontWeight: 600 },
  scoreValue: { fontSize: 32, fontWeight: 800, margin: '2px 0' },
  comboBadge: { color: '#fff', fontWeight: 700, fontSize: 14 },
  scoreBest: { opacity: 0.6, marginTop: 2 },
  wrap: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    font: '12px/1.5 system-ui, sans-serif',
    color: '#1d1b19',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  panel: {
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(6px)',
    borderRadius: 8,
    padding: '10px 12px',
  },
  stats: {
    display: 'flex',
    gap: 14,
    fontVariantNumeric: 'tabular-nums',
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(6px)',
    borderRadius: 8,
    padding: '6px 12px',
  },
  key: {
    minWidth: 64,
    fontWeight: 600,
    letterSpacing: 0.3,
  },
}
