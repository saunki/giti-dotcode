import { Suspense, useCallback, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import TireScene from './TireScene.jsx'
import CameraIntro from './CameraIntro.jsx'
import { ErrorBoundary, GlobalErrors } from './ErrorScreen.jsx'
import { InteractionHUD } from './TireInteractions.jsx'

// RS Camera.1 from C4D: 100 mm lens on a 36 mm sensor, 16:9 -> ~11.6 deg vertical FOV.
// Orbit around the wheel centre rather than the C4D focus point so the tire stays framed.
// Same viewing angle as the C4D camera, pulled back along that line so there is room
// to see the elephants around the tire.
const CAMERA_TARGET = [0, 0.42, 0]
const C4D_CAMERA = [2.5226, 2.1836, 4.1301]
const CAMERA_PULLBACK = 2.4 // 5.1 m -> 12.2 m from the tire
const CAMERA_POSITION = C4D_CAMERA.map((v, i) => CAMERA_TARGET[i] + (v - CAMERA_TARGET[i]) * CAMERA_PULLBACK)
const BACKGROUND = '#c9c7c4'

// Dev only: expose the R3F store as window.__r3f for debugging from the console.
function ExposeStore() {
  const get = useThree((s) => s.get)
  useEffect(() => {
    window.__r3f = get
  }, [get])
  return null
}

export default function App() {
  // live simulation state from TireInteractions, read by the HUD outside the canvas
  const statsRef = useRef(null)
  const onStats = useCallback((st) => {
    statsRef.current = st
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <GlobalErrors />
      <ErrorBoundary>
        <Canvas
          dpr={[1, 2]}
          camera={{ position: CAMERA_POSITION, fov: 11.6, near: 0.1, far: 50 }}
          gl={{ antialias: true }}
        >
          {import.meta.env.DEV && <ExposeStore />}
          <color attach="background" args={[BACKGROUND]} />
          {/* the endless floor fades into the background colour: no horizon line */}
          <fog attach="fog" args={[BACKGROUND, 18, 55]} />
          <Suspense fallback={null}>
            <TireScene onStats={onStats} />
            {/* mounts once the scene has loaded: close-up, then pull back to the default view */}
            <CameraIntro />
          </Suspense>
          <OrbitControls
            makeDefault
            target={CAMERA_TARGET}
            enableDamping
            enablePan={false}
            minDistance={3}
            maxDistance={20}
            minPolarAngle={0.2}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />
        </Canvas>
      </ErrorBoundary>
      <InteractionHUD statsRef={statsRef} />
    </div>
  )
}
