import { useEffect, useMemo, useRef } from 'react'
import { hideLoader } from './loader.js'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CALLOUTS } from './content.js'
import { SIDEWALL_X, WHEEL_CENTER, WHEEL_RADIUS, wheelState } from './wheel.js'

// Callouts pinned to the sidewall lettering. Inside the canvas, <CalloutProjector>
// projects each anchor to the screen every frame and moves the DOM elements of
// <CalloutLayer> directly (no React renders per frame). Labels sit in one column to the
// right of the tire; their leaders follow the lettering as the wheel rolls.

const DEG = Math.PI / 180
const nodes = {} // id -> { box, line, ring }
const v = new THREE.Vector3()

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function toScreen(point, camera, size) {
  v.copy(point).project(camera)
  return [(v.x * 0.5 + 0.5) * size.width, (-v.y * 0.5 + 0.5) * size.height]
}

// right-hand column: labels stack in one column beside the tire, evenly spaced and
// ordered top-to-bottom like their anchors, so leaders never cross each other
const COLUMN_GAP = 90 // px between the tire's right edge and the column
const TOP = 96 // below the header
const BOTTOM = 32
const MAX_SPACE = 70 // cap on the gap between labels when only a few are shown

const ELBOW = 28 // px: leaders turn horizontal this far left of the column
const barY = (it, top) => top + Math.min(it.h, 56) / 2 // a leader meets the label bar, not its panel

// label tops for a given order: evenly spaced, the block centred in the free height
function slots(order, height) {
  const room = height - TOP - BOTTOM
  const used = order.reduce((sum, it) => sum + it.h, 0)
  const space = Math.max(10, Math.min(MAX_SPACE, (room - used) / (order.length + 1)))
  let y = TOP + Math.max(space, (room - used - space * (order.length - 1)) / 2)
  return order.map((it) => {
    const top = y
    y += it.h + space
    return top
  })
}

// do segments p1-p2 and p3-p4 properly intersect?
function crosses(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  const d1 = d(x3, y3, x4, y4, x1, y1)
  const d2 = d(x3, y3, x4, y4, x2, y2)
  const d3 = d(x1, y1, x2, y2, x3, y3)
  const d4 = d(x1, y1, x2, y2, x4, y4)
  return d1 * d2 < 0 && d3 * d4 < 0
}

// Crossed leaders first (heavily), then total slant: shorter, flatter leaders read better.
function orderCost(order, elbowX, height) {
  const tops = slots(order, height)
  const ends = order.map((it, i) => barY(it, tops[i]))
  let cost = 0
  for (let i = 0; i < order.length; i++) {
    cost += Math.abs(ends[i] - order[i].ay)
    for (let j = i + 1; j < order.length; j++) {
      const a = order[i]
      const b = order[j]
      if (crosses(a.ax, a.ay, elbowX, ends[i], b.ax, b.ay, elbowX, ends[j])) cost += 1e5
    }
  }
  return cost
}

function* permutations(list, n = list.length) {
  if (n <= 1) yield list.slice()
  else
    for (let i = 0; i < n; i++) {
      yield* permutations(list, n - 1)
      const j = n % 2 ? 0 : i
      ;[list[j], list[n - 1]] = [list[n - 1], list[j]]
    }
}

// With at most six labels every order can be tried (720). The previous order is kept
// unless another is clearly better, so labels don't swap back and forth while rolling.
function bestOrder(shown, elbowX, height, previous) {
  let best = null
  let bestCost = Infinity
  for (const order of permutations(shown.slice())) {
    const cost = orderCost(order, elbowX, height)
    if (cost < bestCost) [best, bestCost] = [order, cost]
  }
  const kept = previous.map((n) => shown.find((it) => it.n === n)).filter(Boolean)
  if (kept.length === shown.length && orderCost(kept, elbowX, height) <= bestCost + 30) return kept
  return best ?? []
}

export function CalloutProjector({ focus }) {
  const { camera, size } = useThree()
  const centre = new THREE.Vector3(...WHEEL_CENTER)
  const p = new THREE.Vector3()
  const frames = useRef(0)
  const ray = useMemo(() => Object.assign(new THREE.Raycaster(), { firstHitOnly: true }), [])
  const orderRef = useRef([]) // last frame's label order (nodes), kept unless clearly worse

  useFrame((_, dt) => {
    // mounted inside the scene's Suspense: some frames after the tire first draws, tell
    // screenshot scripts (scripts/capture-site.mjs) the page is ready
    if (++frames.current === 40) {
      window.__siteReady = true
      hideLoader()
    }

    // The camera rig moved the camera earlier this frame, but its view matrix is only
    // refreshed at render time: without this the rings trail the tire by a frame.
    camera.updateMatrixWorld()
    const [cx, cy] = toScreen(centre, camera, size)
    const [, ty] = toScreen(p.set(0, WHEEL_CENTER[1] + WHEEL_RADIUS, 0), camera, size)
    const radius = cy - ty // tire radius on screen, px
    // phones: no room beside the tire, so only the current section's label shows, under it
    const narrow = size.width < 760
    const columnLeft = narrow ? 16 : Math.min(cx + radius * 0.85 + COLUMN_GAP, size.width - 360 - 110)

    // pass 1: anchors on the sidewall, rolled with the wheel
    const items = []
    for (const c of CALLOUTS) {
      const n = nodes[c.id]
      if (!n?.box) continue
      const world = c.theta * DEG - wheelState.angle // world theta = local theta - angle
      const { roll, anchors, meshes } = wheelState
      if (roll && anchors) roll.localToWorld(p.copy(anchors[c.id])) // the hit point on the sidewall
      else p.set(SIDEWALL_X, WHEEL_CENTER[1] + Math.sin(world) * c.r, Math.cos(world) * c.r)
      const [ax, ay] = toScreen(p, camera, size)

      // hidden behind the tire's own bulge when the camera swings round to the tread:
      // a ray from the camera hits rubber before it reaches the anchor
      let blocked = 0
      if (meshes) {
        const dist = ray.ray.origin.copy(camera.position).distanceTo(p)
        ray.ray.direction.copy(p).sub(camera.position).normalize()
        ray.far = dist
        const hit = ray.intersectObjects(meshes, false)[0]
        blocked = hit && hit.distance < dist - 0.012 ? 1 : 0
      }
      n.blocked = (n.blocked ?? blocked) + (blocked - (n.blocked ?? blocked)) * (1 - Math.exp(-dt * 12))

      // lettering near the floor is hard to see: its label fades out and frees its slot
      const wrapped = ((world / DEG) % 360 + 360) % 360
      const visible = (1 - smooth(200, 225, wrapped) * (1 - smooth(305, 330, wrapped))) * (1 - n.blocked)
      const focused = focus ? c.id === focus : !narrow
      if (narrow && !focused) {
        n.box.style.opacity = n.line.style.opacity = n.ring.style.opacity = 0
        n.box.style.pointerEvents = 'none'
        continue
      }
      items.push({ n, ax, ay, visible, focused, opacity: visible * (focused ? 1 : 0.55), h: n.box.offsetHeight })
    }

    // pass 2: slots, evenly spread down the column, in the order whose leaders don't cross
    const shown = items.filter((it) => it.visible > 0.3)
    if (narrow) {
      // (an unfolded panel slides up over the tire as far as it needs to stay on screen)
      for (const it of shown) it.top = Math.max(84, Math.min(cy + radius * 1.12 + 20, size.height - it.h - 16))
    } else {
      const order = bestOrder(shown, columnLeft - ELBOW, size.height, orderRef.current)
      orderRef.current = order.map((it) => it.n)
      slots(order, size.height).forEach((top, i) => (order[i].top = top))
    }

    // pass 3: ease boxes to their slots (re-ordering slides instead of jumping), draw
    const ease = 1 - Math.exp(-dt * 9)
    for (const it of items) {
      const { n, ax, ay, focused } = it
      const opacity = it.top === undefined ? 0 : it.opacity // no slot: fade out (CSS transition)
      const target = it.top ?? n.top ?? ay
      n.top = n.top === undefined ? target : n.top + (target - n.top) * ease
      const top = n.top
      const left = columnLeft
      n.box.style.transform = `translate(${left}px, ${top}px)`
      n.box.style.opacity = opacity
      n.box.style.pointerEvents = opacity > 0.2 ? 'auto' : 'none'
      n.box.dataset.focused = focus && focused ? 'true' : 'false'

      // leader: anchor -> elbow just left of the column -> middle of the label's edge
      // (phones: straight down from the anchor to the label's top edge)
      const ey = narrow ? top : barY(it, top)
      const elbow = narrow ? ax : left - ELBOW
      const dx = elbow - ax,
        dy = ey - ay
      const k = 9 / Math.max(Math.hypot(dx, dy), 9) // start at the ring's edge
      n.line.setAttribute(
        'points',
        narrow ? `${ax},${ay + 9} ${ax},${ey}` : `${ax + dx * k},${ay + dy * k} ${elbow},${ey} ${left},${ey}`,
      )
      n.line.style.opacity = opacity
      n.ring.setAttribute('cx', ax)
      n.ring.setAttribute('cy', ay)
      n.ring.style.opacity = opacity
    }
  })
  return null
}

function Detail({ c }) {
  return (
    <div className="callout-detail">
      <p className="lead">{c.lead}</p>
      {c.code && (
        <dl className="code">
          {c.code.map(([part, name, what]) => (
            <div key={part}>
              <dt>{part}</dt>
              <dd>
                <strong>{name}</strong>
                {what}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {c.steps && (
        <ol className="steps">
          {c.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      )}
      {c.body.map((t) => (
        <p key={t}>{t}</p>
      ))}
    </div>
  )
}

export function CalloutLayer({ open, onToggle }) {
  const svgRef = useRef()
  useEffect(() => () => Object.keys(nodes).forEach((k) => delete nodes[k]), [])
  const reg = (id, key) => (el) => {
    nodes[id] = { ...nodes[id], [key]: el }
  }

  return (
    <div className="callouts">
      <svg ref={svgRef} className="leaders" aria-hidden="true">
        {CALLOUTS.map((c) => (
          <g key={c.id}>
            <polyline ref={reg(c.id, 'line')} />
            <circle ref={reg(c.id, 'ring')} r="8" />
          </g>
        ))}
      </svg>
      {CALLOUTS.map((c) => (
        <div key={c.id} ref={reg(c.id, 'box')} className="callout" data-open={open === c.id}>
          <button type="button" className="callout-label" onClick={() => onToggle(c.id)} aria-expanded={open === c.id}>
            <span className="name">{c.label}</span>
            <span className="tag">{c.tag}</span>
            <span className="plus" aria-hidden="true" />
          </button>
          {open === c.id && <Detail c={c} />}
        </div>
      ))}
    </div>
  )
}
