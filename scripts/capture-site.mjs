// Screenshots of the tire website (index.html) for design reviews, through headless Chrome.
// Usage: node scripts/capture-site.mjs <base-url> <out-dir> name=query [name=query ...]
//   e.g. node scripts/capture-site.mjs http://localhost:5173 shots hero= size=s=5
//   name=query|wheel=600   also scrolls with the mouse wheel (px) after load, like a user
//   name=query|size=390x844 captures at another viewport size (phone: mobile emulation)
// Waits for window.__siteReady (set once the 3D scene has drawn) before each capture.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [base, outDir, ...shots] = process.argv.slice(2)
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const W = 1600, H = 900, PORT = 9333
mkdirSync(outDir, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', '--enable-unsafe-swiftshader',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'cap-'))}`, `--window-size=${W},${H}`, 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let target
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200)
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page') } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data)
  if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) }
})
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value

for (const shot of shots) {
  const [name, rest = ''] = shot.split(/=(.*)/s)
  const [query, ...opts] = rest.split('|')
  const opt = Object.fromEntries(opts.map((o) => o.split('=')))
  const [w, h] = (opt.size ?? `${W}x${H}`).split('x').map(Number)
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 760 })
  await send('Page.navigate', { url: `${base}/${opt.page ?? ''}?${query}` })
  const t0 = Date.now()
  while (!(await evaluate('window.__siteReady === true'))) {
    if (Date.now() - t0 > 120000) throw new Error(`timeout: ${name}`)
    await sleep(500)
  }
  const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, ...extra })
  const report = async (what) =>
    console.log(`  after ${what}: ${await evaluate("document.querySelector('.caption .kicker')?.textContent")}`)
  // |wheel=100,100,100: one or more wheel notches (px), 800 ms apart
  if (opt.wheel) {
    for (const dy of opt.wheel.split(',').map(Number)) {
      await mouse('mouseMoved', w / 2, h / 2)
      await mouse('mouseWheel', w / 2, h / 2, { deltaX: 0, deltaY: dy })
      await sleep(800)
    }
    await sleep(1700) // the wheel easing to its new angle
    await report('wheel')
  }
  // |drag=dx,dy: grab the tire and throw it (fast drag over ~100 ms, then release)
  if (opt.drag) {
    const [dx, dy] = opt.drag.split(',').map(Number)
    const x0 = w * 0.4, y0 = h * 0.45
    await mouse('mouseMoved', x0, y0)
    await mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 })
    for (let i = 1; i <= 8; i++) {
      await mouse('mouseMoved', x0 + (dx * i) / 8, y0 + (dy * i) / 8, { button: 'left', buttons: 1 })
      await sleep(12)
    }
    await mouse('mouseReleased', x0 + dx, y0 + dy, { button: 'left', buttons: 0, clickCount: 1 })
    await sleep(4000) // coast to a stop
    await report('drag')
  }
  // |mouse=x,y: park the cursor (fractions of the viewport) for the camera tilt
  if (opt.mouse) {
    const [fx, fy] = opt.mouse.split(',').map(Number)
    await mouse('mouseMoved', fx * w, fy * h)
    await sleep(2500)
  }
  if (opt.wheel || opt.drag) console.log(`  wheel angle: ${await evaluate('window.__wheel?.angle.toFixed(2)')}`)
  await sleep(1500) // let the wheel settle and the unfold animation finish
  const { result } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(result.data, 'base64'))
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}
ws.close()
chrome.kill()
