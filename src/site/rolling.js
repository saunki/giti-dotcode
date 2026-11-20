import { CALLOUTS, SECTIONS } from './content.js'
import { READING_ANGLE, wheelState } from './wheel.js'

// The wheel's stops, repeating every lap, so it can roll forever in either direction.
//
// Each sidewall stop is the angle that brings its lettering to the reading spot. One lap
// holds all six; lap n adds n x 2pi. The intro is angle 0 and only exists at the start:
// once the wheel moves, everything is stops.

export const TAU = Math.PI * 2
const STOP_SECTIONS = SECTIONS.map((s, i) => [s, i]).filter(([s]) => s.focus) // [section, index]

// stop angles within one lap, increasing in the order the lettering comes around
export const STOPS = (() => {
  const angles = []
  for (const [s] of STOP_SECTIONS) {
    const c = CALLOUTS.find((x) => x.id === s.focus)
    let a = (c.theta * Math.PI) / 180 - READING_ANGLE
    while (a <= (angles.at(-1) ?? 0)) a += TAU
    angles.push(a)
  }
  return angles
})()

/** Section index (into SECTIONS) for stop k. */
export const sectionOfStop = (k) => STOP_SECTIONS[k][1]
/** Stop k (0..5) for a section index, or -1 for the intro. */
export const stopOfSection = (i) => STOP_SECTIONS.findIndex(([, idx]) => idx === i)

// every occurrence of every stop near angle a
function* around(a) {
  for (let k = 0; k < STOPS.length; k++) {
    const n = Math.round((a - STOPS[k]) / TAU)
    for (let d = -1; d <= 1; d++) yield { k, angle: STOPS[k] + (n + d) * TAU }
  }
}

const EPS = 1e-3
export function nextStop(a, dir) {
  let best = null
  for (const s of around(a)) {
    const ahead = dir > 0 ? s.angle > a + EPS : s.angle < a - EPS
    if (ahead && (!best || Math.abs(s.angle - a) < Math.abs(best.angle - a))) best = s
  }
  return best
}

export function nearestStop(a) {
  let best = null
  for (const s of around(a)) if (!best || Math.abs(s.angle - a) < Math.abs(best.angle - a)) best = s
  return best
}

/** The closest occurrence of stop k to angle a (shortest roll to get there). */
export function closestOccurrence(k, a) {
  return STOPS[k] + Math.round((a - STOPS[k]) / TAU) * TAU
}

// ---- motion modes, read every frame by <WheelDriver> --------------------------------
// ease:  glide to wheelState.target (wheel notches, keys, dots, labels)
// drag:  angle follows the pointer
// coast: free roll after a throw, slowed by rolling friction; stops wherever it stops

const FRICTION = 1.6 // 1/s, exponential decay of the coasting speed
const MAX_SPEED = 30 // rad/s

export function rollTo(angle) {
  wheelState.mode = 'ease'
  wheelState.target = angle
  wheelState.intro = false
}

export function step(dir) {
  // from where the wheel is heading, so quick repeated notches add up
  const from = wheelState.mode === 'ease' ? wheelState.target : wheelState.angle
  rollTo(nextStop(from, dir).angle)
}

export function startDrag() {
  wheelState.mode = 'drag'
  wheelState.velocity = 0
  wheelState.intro = false
}

export function dragBy(delta) {
  wheelState.angle += delta
  wheelState.target = wheelState.angle
}

export function release(velocity) {
  wheelState.velocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, velocity))
  wheelState.mode = 'coast'
}

export function advance(dt) {
  const w = wheelState
  if (w.mode === 'ease') {
    w.angle += (w.target - w.angle) * (1 - Math.exp(-dt * 5))
  } else if (w.mode === 'coast') {
    w.angle += w.velocity * dt
    w.velocity *= Math.exp(-dt * FRICTION)
    if (Math.abs(w.velocity) < 0.05) {
      w.mode = 'ease'
      w.target = w.angle // stop anywhere: no snapping
    }
  }
}
