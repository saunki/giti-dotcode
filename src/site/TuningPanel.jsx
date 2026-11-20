import { useEffect, useRef } from 'react'
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js'
import { changed, resetTuning, tuning, useTuning } from './tuning.js'
import { TONE_MAPPINGS } from './TuningApplier.jsx'

// Look-dev panel (lil-gui, ships with three), only shown with ?tune in the address;
// H hides/shows it. Every change is saved in this browser and applied live.
// "Copy settings" puts the values on the clipboard to paste into tuning.js DEFAULTS.

const HDRIS = {
  'C4D studio (original)': 'c4d',
  Studio: 'studio',
  City: 'city',
  Warehouse: 'warehouse',
  Apartment: 'apartment',
  Lobby: 'lobby',
  Sunset: 'sunset',
  Dawn: 'dawn',
  Night: 'night',
  Park: 'park',
  Forest: 'forest',
}

export default function TuningPanel() {
  const gui = useRef(null)
  const materialNames = useTuning((t) => Object.keys(t.materials).join('|'))

  useEffect(() => {
    const g = new GUI({ title: 'Look dev (H to hide)', width: 300 })
    g.domElement.classList.add('tuning-panel')
    gui.current = g
    const on = (ctrl) => ctrl.onChange(changed)

    const lights = g.addFolder('Lights')
    on(lights.add(tuning.lights, 'rotation', -180, 180, 1).name('Rotate all (°)'))
    for (const name of ['Rim', 'Rim.1', 'Rim.2', 'Side']) {
      const f = lights.addFolder(name)
      const s = tuning.lights[name]
      on(f.add(s, 'on'))
      on(f.add(s, 'intensity', 0, 40, 0.1))
      on(f.add(s, 'rotation', -180, 180, 1).name('rotation (°)'))
      on(f.addColor(s, 'color'))
      f.close()
    }

    const env = g.addFolder('HDRI')
    on(env.add(tuning.env, 'hdri', HDRIS).name('map'))
    on(env.add(tuning.env, 'intensity', 0, 3, 0.01))
    on(env.add(tuning.env, 'rotation', 0, 360, 1).name('rotation (°)'))

    const shadow = g.addFolder('Shadow / AO (baked)')
    on(shadow.add(tuning.shadow, 'strength', 0, 1.5, 0.01))
    on(shadow.add(tuning.shadow, 'rotation', -180, 180, 1).name('rotation (°)'))

    const tone = g.addFolder('Tone mapping')
    on(tone.add(tuning.tone, 'mapping', Object.keys(TONE_MAPPINGS)))
    on(tone.add(tuning.tone, 'exposure', 0.2, 3, 0.01))

    g.addFolder('Materials') // filled below once the scene has loaded

    const scene = g.addFolder('Background & fog')
    on(scene.addColor(tuning.scene, 'background'))
    on(scene.add(tuning.scene, 'fogNear', 0, 60, 0.5).name('fog start (m)'))
    on(scene.add(tuning.scene, 'fogFar', 1, 120, 0.5).name('fog end (m)'))

    g.add(
      {
        copy: () => {
          const json = JSON.stringify(tuning, null, 2)
          navigator.clipboard?.writeText(json).catch(() => {})
          console.log(json)
        },
      },
      'copy',
    ).name('📋 Copy settings')
    g.add({ reset: () => confirm('Reset every look-dev setting to the original?') && resetTuning() }, 'reset').name(
      '↺ Reset all',
    )

    const onKey = (e) => {
      if (e.key.toLowerCase() === 'h' && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement))
        g.show(g._hidden)
    }
    window.addEventListener('keydown', onKey)
    // drags and wheel turns inside the panel shouldn't roll the tire
    const stop = (e) => e.stopPropagation()
    g.domElement.addEventListener('wheel', stop)
    g.domElement.addEventListener('pointerdown', stop)
    return () => {
      window.removeEventListener('keydown', onKey)
      g.destroy()
    }
  }, [])

  // material folders, once the scene reports its materials
  useEffect(() => {
    const folder = gui.current?.folders.find((f) => f._title === 'Materials')
    if (!folder || !materialNames) return
    folder.folders.slice().forEach((f) => f.destroy())
    for (const name of materialNames.split('|')) {
      const s = tuning.materials[name]
      const f = folder.addFolder(name)
      f.add(s, 'envMapIntensity', 0, 3, 0.01).name('reflections').onChange(changed)
      f.addColor(s, 'color').onChange(changed)
      if (s.clearcoat !== undefined) f.add(s, 'clearcoat', 0, 1, 0.01).onChange(changed)
      f.close()
    }
  }, [materialNames])

  return null
}
