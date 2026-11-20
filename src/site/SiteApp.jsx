import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import SiteScene from './SiteScene.jsx'
import CameraRig from './CameraRig.jsx'
import TuningApplier from './TuningApplier.jsx'
import TuningPanel from './TuningPanel.jsx'
import { TUNE } from './tuning.js'
import { CalloutLayer, CalloutProjector } from './Callouts.jsx'
import { CALLOUTS, MENU, SECTIONS } from './content.js'
import { wheelState } from './wheel.js'
import {
  STOPS,
  advance,
  closestOccurrence,
  dragBy,
  nearestStop,
  release,
  rollTo,
  sectionOfStop,
  startDrag,
  step,
  stopOfSection,
} from './rolling.js'
import { assetUrl } from '../assets.js'
import { setLoadProgress } from './loader.js'
import { ErrorBoundary, GlobalErrors } from '../ErrorScreen.jsx'

const BACKGROUND = '#c9c7c4'
const params = new URLSearchParams(location.search)
const SIDE_VIEW = params.has('side') // calibration: look straight at the outer sidewall
// ?clean: just the 3D scene, centred, no header/callouts/copy (stills for presentations)
const CLEAN = params.has('clean')


// RS Camera.1 from C4D: the website keeps the render framing (plus the cursor tilt)
const CAMERA_TARGET = [0, 0.42, 0]
const CAMERA_POSITION = SIDE_VIEW ? [8, 0.4, 0] : [2.5226, 2.1836, 4.1301]

function LookAt({ target }) {
  const camera = useThree((s) => s.camera)
  camera.lookAt(...target)
  return null
}

// Moves the tire left of centre to free the right side for the callout column, without
// changing the render's perspective: a lens shift (view offset), not a camera move.
// Phones (narrow, tall): zoom out until the tire fits the width, and lift it to the top
// half so its callout and the copy fit underneath.
const FRAME_SHIFT = 0.11 // fraction of the viewport width
const NARROW = 760 // px; below this the phone layout is used (same breakpoint in Callouts.jsx, site.css)
const TIRE_W = 0.62 // tire width / viewport height at zoom 1 (the C4D framing)
const TIRE_H = 0.78 // tire height (tread + floor contact) / viewport height at zoom 1
function FrameShift({ shift = FRAME_SHIFT }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useLayoutEffect(() => {
    const { width: w, height: h } = size
    if (w < NARROW) {
      camera.zoom = Math.min(1, (0.92 * w) / (TIRE_W * h))
      const tireTop = 84 // just under the header
      const centre = tireTop + (TIRE_H * h * camera.zoom) / 2
      camera.setViewOffset(w, h, 0, h / 2 - centre, w, h)
    } else {
      camera.zoom = 1
      camera.setViewOffset(w, h, w * shift, 0, w, h)
    }
    camera.updateProjectionMatrix()
    return () => camera.clearViewOffset()
  }, [camera, size, shift])
  return null
}

// advances the wheel every frame (rolling.js) and reports which section it's on
function WheelDriver({ onSection }) {
  const last = useRef(null)
  useFrame((_, dt) => {
    advance(Math.min(dt, 0.1))
    const section = wheelState.intro ? 0 : sectionOfStop(nearestStop(wheelState.angle).k)
    if (section !== last.current) onSection((last.current = section))
  })
  return null
}

function Header() {
  const [menu, setMenu] = useState(false)
  return (
    <header className="site-header" data-menu={menu}>
      <a className="logo" href="#hero" aria-label="Giti home">
        <img src={assetUrl('brand/giti-logo.svg')} alt="Giti" />
      </a>
      {/* phones: the menu folds into a button */}
      <button type="button" className="menu-button" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu((m) => !m)}>
        <span />
      </button>
      <nav aria-label="Main">
        {MENU.map((m, i) => (
          <a key={m} href="#" className={i === 2 ? 'active' : undefined}>
            {m}
          </a>
        ))}
      </nav>
      <a className="cta" href="#">
        Find a dealer
      </a>
    </header>
  )
}

// Grab and roll (mouse or finger): dragging down / left rolls forward. The drag is scaled
// to the tire's size on screen, so the tread moves with the pointer. On release the wheel
// keeps the throw's speed and coasts until rolling friction stops it, wherever that is.
function useGrabToRoll(stageRef, onClick) {
  useEffect(() => {
    const el = stageRef.current
    let drag = null
    const onDown = (e) => {
      if (e.button !== 0) return
      drag = { x: e.clientX, y: e.clientY, moved: false, samples: [], id: e.pointerId }
    }
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 4) return // still a click
        drag.moved = true
        startDrag()
        el.setPointerCapture(e.pointerId)
        el.dataset.dragging = 'true'
      }
      // the tire's screen radius: ~39 % of the view height in the render's framing
      const radiusPx = 0.39 * window.innerHeight * (window.innerWidth < NARROW ? 0.6 : 1)
      const delta = (dy - dx * 0.6) / radiusPx
      dragBy(delta)
      drag.x = e.clientX
      drag.y = e.clientY
      const now = performance.now()
      drag.samples.push([now, delta])
      while (drag.samples.length && now - drag.samples[0][0] > 90) drag.samples.shift()
    }
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return
      if (drag.moved) {
        // throw speed from the last ~90 ms of movement
        const s = drag.samples
        const span = s.length > 1 ? (performance.now() - s[0][0]) / 1000 : 0
        const total = s.reduce((sum, [, d]) => sum + d, 0)
        release(span > 0.008 ? total / span : 0)
        delete el.dataset.dragging
      } else onClick()
      drag = null
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [stageRef, onClick])
}

// Wheel notches and keys step one stop; there are no ends, the stops repeat every lap.
function useStepInput(onEscape) {
  useEffect(() => {
    let lockUntil = 0
    let acc = 0
    let last = 0
    const onWheel = (e) => {
      if (e.target.closest?.('.callout-detail')) return // long panels scroll themselves
      e.preventDefault()
      const now = performance.now()
      if (now < lockUntil) {
        lockUntil = Math.max(lockUntil, now + 150) // trackpad inertia: wait for it to die out
        return
      }
      if (now - last > 300) acc = 0
      last = now
      acc += e.deltaY * (e.deltaMode === 1 ? 40 : 1)
      if (Math.abs(acc) >= 40) {
        step(Math.sign(acc))
        acc = 0
        lockUntil = now + 700
      }
    }
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      const dir = { ArrowDown: 1, PageDown: 1, ' ': e.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1 }[e.key]
      if (dir) step(dir)
      else if (e.key === 'Escape') onEscape()
      else return
      e.preventDefault()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [onEscape])
}

export default function SiteApp() {
  const [section, setSection] = useState(() => {
    // ?angle=deg: start at an exact roll angle (lighting checks)
    if (params.has('angle')) {
      wheelState.angle = wheelState.target = (Number(params.get('angle')) * Math.PI) / 180
      wheelState.intro = false
    }
    // ?s=N: start on a section (mock-ups)
    const k = stopOfSection(Number(params.get('s') ?? 0))
    if (k < 0) return 0
    wheelState.angle = wheelState.target = STOPS[k]
    wheelState.intro = false
    return sectionOfStop(k)
  })
  const [open, setOpen] = useState(params.get('open'))
  const stageRef = useRef()
  const close = useCallback(() => setOpen(null), [])

  // the section follows the wheel (it can roll past several while coasting);
  // a new section folds the open panel away
  //
  // A click on another section's label rolls the wheel there and asks for that panel to
  // unfold on arrival (`pendingOpen`); the sections passed on the way don't cancel it.
  // It only unfolds if the wheel is still heading where the click sent it, so a scroll or
  // drag in between drops the request.
  const sectionRef = useRef(section)
  const pendingOpen = useRef(null) // { id, angle }
  const onSection = useCallback((s) => {
    if (s === sectionRef.current) return
    sectionRef.current = s
    setSection(s)
    const pending = pendingOpen.current
    if (pending && wheelState.target === pending.angle) {
      if (SECTIONS[s].focus !== pending.id) return // still on the way: leave it folded
      pendingOpen.current = null
      setOpen(pending.id)
      return
    }
    pendingOpen.current = null
    setOpen(null)
  }, [])

  useStepInput(close)
  useGrabToRoll(stageRef, close) // a click (no drag) on the empty scene closes the panel

  const goToStop = (k) => rollTo(closestOccurrence(k, wheelState.target))

  // clicking another section's label rolls there and unfolds it; its own label toggles
  const onToggle = (id) => {
    const target = SECTIONS.findIndex((s) => s.focus === id)
    if (target !== -1 && target !== section) {
      setOpen(null)
      goToStop(stopOfSection(target))
      pendingOpen.current = { id, angle: wheelState.target } // unfolds when it arrives
    } else setOpen((o) => (o === id ? null : id))
  }

  const current = SECTIONS[section] ?? SECTIONS[0]

  return (
    <div className="site">
      <GlobalErrors />
      <LoadProgress />
      <ErrorBoundary>
        <div className="stage" ref={stageRef}>
          <Canvas resize={{ debounce: 0 }} dpr={[1, 2]} camera={{ position: CAMERA_POSITION, fov: SIDE_VIEW ? 8 : 11.6, near: 0.1, far: 50 }}>
            {SIDE_VIEW ? <LookAt target={[0, 0.4, 0]} /> : <CameraRig position={CAMERA_POSITION} target={CAMERA_TARGET} />}
            <color attach="background" args={[BACKGROUND]} />
            <fog attach="fog" args={[BACKGROUND, 12, 40]} />
            <WheelDriver onSection={onSection} />
            {/* the look (lights, HDRI, shadow, tone mapping, materials): tuning.js */}
            <TuningApplier />
            {!SIDE_VIEW && <FrameShift shift={CLEAN ? 0 : FRAME_SHIFT} />}
            <Suspense fallback={null}>
              <SiteScene />
              <CalloutProjector focus={current.focus} />
            </Suspense>
          </Canvas>
        </div>
        {!CLEAN && <CalloutLayer open={open} onToggle={onToggle} />}
      </ErrorBoundary>

      {!CLEAN && <Header />}
      {/* look-dev panel, only with ?tune in the address */}
      {TUNE && <TuningPanel />}

      {/* section copy, bottom left */}
      <div className="caption" key={current.id} hidden={CLEAN}>
        <span className="kicker">
          {section === 0 ? 'Intro' : `${String(stopOfSection(section) + 1).padStart(2, '0')} / ${String(STOPS.length).padStart(2, '0')}`}
          {' · '}
          {current.kicker}
        </span>
        <h1>{current.title}</h1>
        <p>{current.text}</p>
      </div>

      {/* stop dots, right edge (the intro only exists at the start) */}
      <nav className="progress" aria-label="Sections" hidden={CLEAN}>
        {SECTIONS.map((s, i) =>
          s.focus ? (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={i === section ? 'active' : undefined}
              aria-current={i === section ? 'step' : undefined}
              onClick={(e) => {
                e.preventDefault()
                goToStop(stopOfSection(i))
              }}
            >
              <span>{CALLOUTS.find((c) => c.id === s.focus).label}</span>
            </a>
          ) : null,
        )}
      </nav>
    </div>
  )
}

/** Feeds the file-loading progress to the loading screen in index.html. */
function LoadProgress() {
  const progress = useProgress((s) => s.progress)
  useEffect(() => setLoadProgress(progress), [progress])
  return null
}
