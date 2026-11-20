import { useSyncExternalStore } from 'react'

// The site's look: lights, HDRI, baked shadow, tone mapping, materials and fog, applied
// to the scene every frame by <TuningApplier>. DEFAULTS is the signed-off look.
//
// Look dev: open the site with ?tune for the panel (TuningPanel.jsx). Changes made there
// are kept in that browser's localStorage and only used together with ?tune; to adopt
// them, "Copy settings" in the panel and paste the values into DEFAULTS.

export const TUNE = (() => {
  const q = new URLSearchParams(location.search)
  return q.has('tune') && q.get('tune') !== '0'
})()

export const DEFAULTS = {
  lights: {
    rotation: 0, // degrees, all four lights together around the tire (vertical axis)
    // each light: turned around the tire from its C4D placement by `rotation` degrees
    Rim: { on: true, intensity: 12, rotation: 136, color: '#fccf00' },
    'Rim.1': { on: true, intensity: 3, rotation: 42, color: '#fccf00' },
    'Rim.2': { on: true, intensity: 3, rotation: 0, color: '#fccf00' },
    Side: { on: true, intensity: 8.9, rotation: 48, color: '#ffffff' },
  },
  env: {
    hdri: 'c4d', // 'c4d' = the studio HDRI from the C4D dome light; others are drei presets
    intensity: 1.2,
    rotation: 247, // degrees
  },
  shadow: {
    strength: 0.99, // the Redshift-baked floor shadow / AO
    rotation: 0, // degrees: turn it to follow rotated lights (the bake itself is fixed)
  },
  tone: {
    mapping: 'ACES Filmic',
    exposure: 1,
  },
  materials: {
    'Rubber Glossy': { envMapIntensity: 0.83, color: '#333333' },
    'Rubber Matte': { envMapIntensity: 1, color: '#303030' },
    'Rubber Lines': { envMapIntensity: 0.75, color: '#333333' },
    'Aluminium Anodized Black': { envMapIntensity: 0.72, color: '#272727' },
    'Concrete Polished': { envMapIntensity: 1, color: '#d7d4d0', clearcoat: 0.32 },
  },
  scene: {
    background: '#c9c7c4',
    fogNear: 3.5,
    fogFar: 21,
  },
}

const KEY = 'giti-site-tuning'
const clone = (o) => JSON.parse(JSON.stringify(o))

function merge(base, saved) {
  if (!saved || typeof saved !== 'object') return base
  for (const k of Object.keys(saved)) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], saved[k])
    else base[k] = saved[k]
  }
  return base
}

function load() {
  if (!TUNE) return clone(DEFAULTS) // visitors always get the signed-off look
  try {
    return merge(clone(DEFAULTS), JSON.parse(localStorage.getItem(KEY)))
  } catch {
    return clone(DEFAULTS)
  }
}

/** The live settings object: mutated in place by the panel, read every frame. */
export const tuning = load()

const listeners = new Set()
let saveTimer = 0
export function changed() {
  listeners.forEach((l) => l())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(tuning))
    } catch {
      // private mode etc.: settings just don't persist
    }
  }, 200)
}

export function resetTuning() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  location.reload()
}

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))

/** Re-render when a selected primitive changes (only for things that need React, like
 *  swapping the HDRI); everything else is applied per frame without React. */
export const useTuning = (select) => useSyncExternalStore(subscribe, () => select(tuning))
