// Shared, mutable wheel state (written by the input handlers, advanced every frame by
// <WheelDriver>, read by the 3D scene and the callout overlay; no React re-renders per
// frame). Motion rules live in rolling.js.

export const WHEEL_CENTER = [0, 0.4, 0] // m, "Wheel.v3" in the C4D scene
export const WHEEL_RADIUS = 0.4735 // m, tread radius
export const SIDEWALL_X = 0.162 // m, the outer (+X) sidewall face where the lettering sits

export const wheelState = {
  angle: 0, // rad around the axle (world X); positive rolls the top towards +Z (forward)
  target: 0,
  velocity: 0, // rad/s while coasting after a throw
  mode: 'ease', // 'ease' | 'drag' | 'coast'
  intro: true, // still on the opening screen (angle 0, before any input)
}

// debugging / screenshot scripts can read it from the console
if (typeof window !== 'undefined') window.__wheel = wheelState

// Where the wheel's sidewall lettering faces the camera best: front-top quarter.
export const READING_ANGLE = (62 * Math.PI) / 180
