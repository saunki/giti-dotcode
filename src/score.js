// Tiny shared score store: elephants report hits, the HUD subscribes.
//
// Each tire hit on an elephant is worth BASE_POINTS times the current combo. Hits
// landed within COMBO_WINDOW of each other build the combo (x2, x3 ...); a pause
// resets it.

const BASE_POINTS = 100
const COMBO_WINDOW = 2.5 // seconds
const MAX_COMBO = 8

const state = { score: 0, combo: 0, best: 0, lastHit: -Infinity }
const listeners = new Set()

export function registerHit() {
  const now = performance.now() / 1000
  state.combo = now - state.lastHit < COMBO_WINDOW ? Math.min(state.combo + 1, MAX_COMBO) : 1
  state.lastHit = now
  const points = BASE_POINTS * state.combo
  state.score += points
  state.best = Math.max(state.best, state.score)
  listeners.forEach((fn) => fn({ ...state }))
  return { points, combo: state.combo }
}

export function resetScore() {
  Object.assign(state, { score: 0, combo: 0, lastHit: -Infinity })
  listeners.forEach((fn) => fn({ ...state }))
}

export function getScore() {
  // the combo lapses on its own once the window passes
  const live = performance.now() / 1000 - state.lastHit < COMBO_WINDOW
  return { ...state, combo: live ? state.combo : 0 }
}

export function subscribeScore(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
