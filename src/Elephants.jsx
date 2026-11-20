import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { registerHit } from './score.js'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Low-poly Giti elephant props scattered over the arena. They are dynamic Rapier
// bodies: the tire (a kinematic body) shoves them and they tumble and settle.
//
// The shape comes from LOGO_URL (any SVG, filled paths) extruded into a chunky
// low-poly solid. Until that file exists a hand-drawn placeholder elephant is used.

export const LOGO_URL = `${import.meta.env.BASE_URL}models/giti-elephant.svg`
const HEIGHT = 0.7 // metres, about 3/4 of the tire
const DEPTH = 0.24 // extrusion thickness in metres (chunky = harder to tip sideways)
const COUNT = 12
// scattered in a tight ring around the tire's start: a target is always a short roll away
const RING_MIN = 1.7 // metres; just clears the tire (0.47 m) plus half an elephant (~0.56 m)
const RING_MAX = 5
const SPACING = 1.4 // minimum distance between elephants
const HIT_COOLDOWN = 1.2 // seconds before the same elephant scores again
const BLINK_TIME = 0.7 // seconds of flashing after a hit

// ---- geometry -------------------------------------------------------------

// Side silhouette, facing +x, y up (arbitrary units; normalised later).
const PLACEHOLDER = [
  [-1.0, 0.75], [-0.95, 1.05], [-0.4, 1.2], [0.3, 1.15], [0.55, 1.35], [0.9, 1.3],
  [1.05, 1.05], [1.1, 0.7], [1.2, 0.35], [1.3, 0.1], [1.18, 0.05], [1.05, 0.35],
  [0.95, 0.65], [0.75, 0.7], [0.7, 0.45], [0.65, 0.0], [0.4, 0.0], [0.4, 0.4],
  [-0.45, 0.4], [-0.45, 0.0], [-0.72, 0.0], [-0.78, 0.5],
]

function placeholderShapes() {
  const shape = new THREE.Shape(PLACEHOLDER.map(([x, y]) => new THREE.Vector2(x, y)))
  const eye = new THREE.Path()
  eye.absarc(0.82, 1.12, 0.06, 0, Math.PI * 2, true)
  shape.holes.push(eye)
  return [shape]
}

async function loadLogoShapes() {
  try {
    const data = await new SVGLoader().loadAsync(LOGO_URL)
    // SVG y points down; flip so the logo stands upright
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p))
    if (!shapes.length) return null
    return { shapes, flipY: true }
  } catch {
    return null
  }
}

// Material groups: 0 = elephant body, 1 = the logo's cut-outs (eye,
// ear/trunk line) filled with a slightly recessed insert in the contrast colour.
function buildGeometry(shapes, flipY) {
  const extrude = (shape, depth, bevel) =>
    new THREE.ExtrudeGeometry(shape, {
      depth,
      curveSegments: 3, // low poly
      bevelEnabled: bevel,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 1,
    })
  const body = mergeGeometries(shapes.map((s) => extrude(s, 1, true)))
  const holes = shapes.flatMap((s) => s.holes.map((h) => new THREE.Shape(h.getPoints(4))))
  const parts = [body]
  if (holes.length) {
    // slightly thinner and centred inside the body thickness
    const inserts = mergeGeometries(holes.map((h) => extrude(h, 0.8, false)))
    inserts.translate(0, 0, 0.1)
    parts.push(inserts)
  }
  let geometry = mergeGeometries(parts, true)
  // mirror z as well so the two reflections cancel and face winding (normals) stays outward
  if (flipY) geometry.scale(1, -1, -1)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const size = box.getSize(new THREE.Vector3())
  const s = HEIGHT / size.y
  // centre on x/z, feet on y = 0, extrusion depth fixed in metres
  geometry.translate(-(box.min.x + size.x / 2), -box.min.y, -(box.min.z + size.z / 2))
  geometry.scale(s, s, DEPTH / size.z)
  // faceted look: split vertices so each face shades flat
  geometry = geometry.toNonIndexed()
  geometry.computeVertexNormals()
  // the body's origin is its centre of mass-ish point, so lift the mesh to centre it
  geometry.translate(0, -HEIGHT / 2, 0)
  return geometry
}

function useElephantGeometry() {
  const [geometry, setGeometry] = useState(() => buildGeometry(placeholderShapes(), false))
  useEffect(() => {
    let alive = true
    loadLogoShapes().then((logo) => {
      if (alive && logo) setGeometry(buildGeometry(logo.shapes, logo.flipY))
    })
    return () => {
      alive = false
    }
  }, [])
  return geometry
}

// ---- layout ---------------------------------------------------------------

function scatter() {
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const spots = []
  while (spots.length < COUNT) {
    // uniform over the ring's area, not bunched at the centre
    const r = Math.sqrt(RING_MIN ** 2 + rand() * (RING_MAX ** 2 - RING_MIN ** 2))
    const a = rand() * Math.PI * 2
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < SPACING)) continue
    spots.push({ x, z, yaw: rand() * Math.PI * 2 })
  }
  return spots
}

// ---- soft blob shadow (cheap; the big baked contact shadow is only for the tire) --

const blobTexture = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(0,0,0,0.75)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.35)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
})()

// ---- components -----------------------------------------------------------

// floating "+points" label (CSS animation; injected once)
if (typeof document !== 'undefined' && !document.getElementById('elephant-popup-style')) {
  const style = document.createElement('style')
  style.id = 'elephant-popup-style'
  style.textContent = `
    @keyframes elephantPopup {
      0%   { transform: translate(-50%, 0) scale(0.6); opacity: 0; }
      15%  { transform: translate(-50%, -12px) scale(1.15); opacity: 1; }
      100% { transform: translate(-50%, -70px) scale(1); opacity: 0; }
    }`
  document.head.appendChild(style)
}

function Elephant({ geometry, material, spot, resetSignal, footprint }) {
  const body = useRef()
  const shadow = useRef()
  const mesh = useRef()
  // own copies of the shared materials so one elephant can flash on its own
  const ownMaterial = useMemo(() => material.map((m) => m.clone()), [material])
  const hit = useRef({ lastScored: -Infinity, blinkUntil: 0 })
  const [popup, setPopup] = useState(null)

  const onCollisionEnter = ({ other }) => {
    if (other.rigidBodyObject?.userData?.kind !== 'tire') return
    const now = performance.now() / 1000
    if (now - hit.current.lastScored < HIT_COOLDOWN) return
    hit.current.lastScored = now
    hit.current.blinkUntil = now + BLINK_TIME
    const { points, combo } = registerHit()
    const t = body.current.translation()
    setPopup({ id: now, points, combo, position: [t.x, t.y + HEIGHT * 0.9, t.z] })
  }

  const start = useMemo(
    () => ({
      position: [spot.x, HEIGHT / 2 + 0.01, spot.z],
      rotation: [0, spot.yaw, 0],
    }),
    [spot],
  )

  useEffect(() => {
    if (!resetSignal || !body.current) return
    const b = body.current
    b.setTranslation({ x: start.position[0], y: start.position[1], z: start.position[2] }, true)
    b.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(...start.rotation)), true)
    b.setLinvel({ x: 0, y: 0, z: 0 }, true)
    b.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }, [resetSignal, start])

  useFrame(() => {
    if (!body.current || !shadow.current) return
    const t = body.current.translation()
    const lift = Math.max(0, t.y - HEIGHT / 2)
    shadow.current.position.set(t.x, 0.003, t.z)
    shadow.current.scale.setScalar(1.1 + lift * 0.8)
    shadow.current.material.opacity = 0.55 * Math.max(0, 1 - lift / 1.5)

    // blink: flash white at ~8 Hz with a little scale pop that settles
    const left = hit.current.blinkUntil - performance.now() / 1000
    const blinking = left > 0
    const on = blinking && Math.floor(left * 16) % 2 === 0
    ownMaterial[0].emissive.set(on ? '#ffffff' : '#000000')
    ownMaterial[0].emissiveIntensity = on ? 0.85 : 0
    if (mesh.current) mesh.current.scale.setScalar(blinking ? 1 + 0.12 * (left / BLINK_TIME) : 1)
  })

  return (
    <>
      <RigidBody
        ref={body}
        position={start.position}
        rotation={start.rotation}
        colliders="hull"
        density={1}
        // low friction: a hit makes them slide and spin rather than trip over their feet
        friction={0.3}
        restitution={0.1}
        linearDamping={0.4}
        angularDamping={2.5}
        userData={{ kind: 'elephant' }}
        onCollisionEnter={onCollisionEnter}
      >
        <mesh ref={mesh} geometry={geometry} material={ownMaterial} userData={{ noContactShadow: true }} />
        {/* invisible heavy foot plate, a bit wider than the body: drops the centre of mass
            to the floor and widens the stance, so they wobble and settle instead of toppling */}
        <CuboidCollider
          args={[footprint.halfLength, 0.025, footprint.halfWidth]}
          position={[0, -HEIGHT / 2 + 0.025, 0]}
          density={60}
          friction={0.3}
        />
      </RigidBody>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} renderOrder={1} userData={{ noContactShadow: true }}>
        <planeGeometry args={[HEIGHT * 1.6, HEIGHT * 1.6]} />
        <meshBasicMaterial map={blobTexture} transparent depthWrite={false} color="#1a1714" />
      </mesh>
      {popup && (
        <Html key={popup.id} position={popup.position} center={false} zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div style={styles.popup} onAnimationEnd={() => setPopup(null)}>
            +{popup.points}
            {popup.combo > 1 && <span style={styles.combo}> x{popup.combo}</span>}
          </div>
        </Html>
      )}
    </>
  )
}

const styles = {
  popup: {
    animation: 'elephantPopup 1.1s ease-out forwards',
    font: '800 22px/1 system-ui, sans-serif',
    color: '#ffe000',
    textShadow: '0 1px 0 #000000, 0 0 6px rgba(0,0,0,0.6)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  combo: { fontSize: 15, color: '#fff' },
}

export default function Elephants() {
  const geometry = useElephantGeometry()
  const spots = useMemo(scatter, [])
  const footprint = useMemo(() => {
    geometry.computeBoundingBox()
    const size = geometry.boundingBox.getSize(new THREE.Vector3())
    return { halfLength: size.x * 0.42, halfWidth: size.z / 2 + 0.06 }
  }, [geometry])
  // Giti logo colours: yellow (#FFE000) body, black eye and ear/trunk line.
  // toneMapped: false keeps the brand yellow saturated; AgX (used for the photoreal tire)
  // otherwise washes it out to a pale cream.
  const material = useMemo(
    () => [
      new THREE.MeshPhysicalMaterial({ color: '#ffe000', roughness: 0.5, flatShading: true, toneMapped: false }),
      new THREE.MeshPhysicalMaterial({ color: '#000000', roughness: 0.45, flatShading: true, toneMapped: false }),
    ],
    [],
  )
  const [resetSignal, setResetSignal] = useState(0)
  useEffect(() => {
    const key = (e) => e.code === 'KeyT' && setResetSignal((n) => n + 1)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  return spots.map((spot, i) => (
    // key on the geometry so the hull collider rebuilds when the real logo loads
    <Elephant
      key={`${i}-${geometry.uuid}`}
      geometry={geometry}
      material={material}
      spot={spot}
      footprint={footprint}
      resetSignal={resetSignal}
    />
  ))
}
