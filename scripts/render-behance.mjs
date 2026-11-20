// Behance presentation images for the interactive chapter of "Giti: The Canvas of the Road".
// Lays out the captures in behance/raw/ as cards on black (the Behance page is black),
// with the site's typography, and screenshots each card at 2x through headless Chrome.
// Usage: node scripts/render-behance.mjs   (captures first: see scripts/capture-site.mjs)
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const RAW = resolve('behance/raw')
const OUT = resolve('behance/upload')
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const LINK = 'saunki.github.io/giti-dotcode'
mkdirSync(OUT, { recursive: true })

const img = (f) => pathToFileURL(join(RAW, f)).href
const anchors = JSON.parse(readFileSync(join(RAW, 'lettering_map.json'), 'utf8'))

const css = /* css */ `
  :root { --y: #ffe000; --mute: #8a8a8a; }
  * { box-sizing: border-box; margin: 0; }
  body { background: #000; color: #fff; font-family: 'Archivo', sans-serif; width: 1400px; }
  .card { width: 1400px; padding: 72px 80px; position: relative; overflow: hidden; }
  .kicker { font-size: 15px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--y); }
  h1, h2 { font-weight: 900; font-style: italic; font-stretch: 112%; text-transform: uppercase; line-height: .92; }
  h1 { font-size: 124px; margin: 18px 0 26px; }
  h2 { font-size: 54px; margin: 12px 0 14px; }
  p { font-size: 20px; line-height: 1.5; color: #d9d9d9; max-width: 560px; }
  .small { font-size: 15px; color: var(--mute); letter-spacing: .02em; }
  .pill { display: inline-flex; gap: 14px; align-items: baseline; margin-top: 34px; background: var(--y); color: #000;
          padding: 16px 24px; font-weight: 900; font-style: italic; font-stretch: 112%; font-size: 22px; text-transform: uppercase; }
  .pill span { font-style: normal; font-weight: 600; font-stretch: 100%; font-size: 17px; text-transform: none; }
  .label { position: absolute; font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
  .shot { display: block; width: 100%; }
  .frame { border-radius: 14px; overflow: hidden; background: #1b1b1b; box-shadow: 0 40px 80px rgba(255,255,255,.04); }
  .bar { height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 16px; background: #1b1b1b; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #3a3a3a; }
  .bar b { margin-left: 18px; font-weight: 500; font-size: 13px; color: #9a9a9a; background: #0e0e0e; padding: 5px 14px; border-radius: 6px; }
  .grid { display: grid; gap: 16px; }
  .cap { margin-top: 12px; font-size: 14px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--mute); }
  .cap em { color: var(--y); font-style: normal; }
  .phone { border-radius: 46px; overflow: hidden; border: 10px solid #1b1b1b; background: #1b1b1b; }
`

const cards = {
  // 1. chapter opener
  '01_intro': `
    <section class="card" style="height:860px">
      <img src="${img('roll0.png')}" style="position:absolute;right:-120px;top:0;width:1050px;
        -webkit-mask-image:radial-gradient(ellipse 52% 60% at 52% 50%, #000 55%, transparent 100%)">
      <div style="position:relative;margin-top:150px;width:620px">
        <div class="kicker">Interactive chapter · GitiSport S2</div>
        <h1>Read<br>the tire</h1>
        <p>The film says a tire is a blank canvas. This chapter lets you hold it: roll a GitiSport S2 in the
           browser and every mark on its sidewall unfolds into what it means — the DOT code above all.</p>
        <div class="pill">Play it live <span>${LINK}</span></div>
      </div>
    </section>`,

  // 2. the site on desktop
  '02_desktop': `
    <section class="card" style="padding-top:40px">
      <div class="frame"><div class="bar"><i></i><i></i><i></i><b>${LINK}</b></div>
        <img class="shot" src="${img('hero.png')}"></div>
      <div class="cap" style="margin-top:22px"><em>01</em> &nbsp;Intro: six callouts pinned to the lettering on the real 3D sidewall</div>
    </section>`,

  // 3. every mark, mapped
  '03_mapped': `
    <section class="card" style="height:1000px">
      <div style="position:absolute;left:80px;top:120px;width:470px">
        <div class="kicker">Every mark, mapped</div>
        <h2>Six stops<br>around the<br>sidewall</h2>
        <p style="font-size:18px">The lettering was measured straight off the 3D model, so each callout is
          anchored to the moulding itself — the Giti logo, max load, Outside, the GitiSport S2 series,
          the size, and the DOT code. Rolling the tire brings them round one by one.</p>
      </div>
      <div style="position:absolute;right:130px;top:90px;width:820px;height:820px">
        <img src="${img('lettering_map.png')}" style="width:100%;height:100%">
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible">
          ${anchors
            .map((a) => {
              const dx = a.x - 0.5, dy = a.y - 0.5, len = Math.hypot(dx, dy)
              const ex = 0.5 + (dx / len) * 0.47, ey = 0.5 + (dy / len) * 0.47
              return `<line x1="${a.x + (dx / len) * 0.02}" y1="${a.y + (dy / len) * 0.02}" x2="${ex}" y2="${ey}"
                stroke="#ffe000" stroke-width="0.0022"/>`
            })
            .join('')}
        </svg>
        ${anchors
          .map((a, i) => {
            const dx = a.x - 0.5, dy = a.y - 0.5, len = Math.hypot(dx, dy)
            const ex = 0.5 + (dx / len) * 0.47, ey = 0.5 + (dy / len) * 0.47
            const right = dx >= 0
            return `<div style="position:absolute;left:${a.x * 100}%;top:${a.y * 100}%;transform:translate(-50%,-50%);
                 width:34px;height:34px;border:3px solid var(--y);border-radius:50%"></div>
               <div class="label" style="left:${ex * 100}%;top:${ey * 100}%;color:var(--y);white-space:nowrap;
                 transform:translate(${right ? '10px' : 'calc(-100% - 10px)'},-50%)">${String(i + 1).padStart(2, '0')} ${a.label}</div>`
          })
          .join('')}
      </div>
    </section>`,

  // 4. the callouts, unfolded
  '04_panels': `
    <section class="card" style="padding-top:40px">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        ${[
          ['brand.png', 'Giti — the brand'],
          ['outside.png', 'Outside — mounting direction'],
          ['size.png', '275/40 R20 — reading the size'],
          ['dot.png', 'DOT 19U P2M7A0 — the tire’s ID'],
        ]
          .map(([f, c]) => `<div><div class="frame"><img class="shot" src="${img(f)}"></div><div class="cap"><em>●</em> &nbsp;${c}</div></div>`)
          .join('')}
      </div>
    </section>`,

  // 5. rolling
  '05_roll': `
    <section class="card">
      <div class="kicker">Scroll · keys · drag</div>
      <h2 style="margin-bottom:28px">It rolls. Forever.</h2>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:10px">
        ${['roll0', 'roll1', 'roll2', 'roll3']
          .map((f, i) => `<div><div style="border-radius:8px;aspect-ratio:3/4;background:url('${img(f + '.png')}') 63% 42% / 290% auto"></div>
             <div class="cap">${[0, 70, 140, 210][i]}°</div></div>`)
          .join('')}
      </div>
      <p style="margin-top:26px;max-width:900px">One wheel notch rolls to the next mark; the stops loop endlessly in both directions.
        Grab the tread to throw it — it coasts on and stops wherever friction ends it. The tire never moves:
        the floor slides underneath, so the studio light stays exactly as rendered.</p>
    </section>`,

  // 6. camera tilt
  '06_tilt': `
    <section class="card" style="padding-top:20px">
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><div class="frame"><img class="shot" src="${img('tiltR.png')}"></div><div class="cap">Cursor top-left</div></div>
        <div><div class="frame"><img class="shot" src="${img('tiltL.png')}"></div><div class="cap">Cursor bottom-right</div></div>
      </div>
      <p style="margin-top:24px;max-width:900px">The camera leans away from the cursor (±15°) — on phones, from the gyroscope —
        and the callouts stay locked to the lettering, hiding when the tire’s own shoulder covers a word.</p>
    </section>`,

  // 7. phones
  '07_phones': `
    <section class="card" style="padding-bottom:90px">
      <div class="kicker" style="text-align:center">Mobile</div>
      <h2 style="text-align:center;margin-bottom:40px">In your pocket</h2>
      <div style="display:flex;gap:56px;justify-content:center">
        ${['phone1', 'phone2', 'phone3'].map((f) => `<div class="phone" style="width:330px"><img class="shot" src="${img(f + '.png')}"></div>`).join('')}
      </div>
    </section>`,

  // 8. render vs real time
  '08_render_vs_webgl': `
    <section class="card">
      <div class="kicker">From Cinema 4D to the browser</div>
      <h2 style="margin-bottom:28px">Same tire, real time</h2>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <div><img class="shot" style="border-radius:8px" src="${img('redshift.webp')}"><div class="cap">Redshift render · Cinema 4D</div></div>
        <div><img class="shot" style="border-radius:8px" src="${img('clean_matched.png')}"><div class="cap"><em>●</em> &nbsp;three.js · real time in the browser</div></div>
      </div>
      <p style="margin-top:24px;max-width:1000px">Geometry, materials, lights and HDRI were carried over from the Redshift scene;
        the rubber, alloy and polished-concrete materials were rebuilt from its node graphs.</p>
    </section>`,

  // 9. under the hood
  '09_under_the_hood': `
    <section class="card">
      <div class="kicker">Under the hood</div>
      <h2 style="margin-bottom:28px">Baked in Redshift</h2>
      <div class="grid" style="grid-template-columns:420px 1fr;gap:56px;align-items:center">
        <img class="shot" style="border-radius:8px" src="${img('shadow_bake.png')}">
        <div>
          <p>The floor shadow is a Redshift bake: the scene rendered from above twice, with the tire hidden from the
             camera but still casting light — and without it. Their ratio is the shadow, contact patch and bounce
             light included. Because the tire only spins in place, one bake stays true at every angle.</p>
          <p class="small" style="margin-top:28px">Cinema 4D · Redshift · three.js · React Three Fiber · Vite</p>
        </div>
      </div>
    </section>`,
}

const html = (body) => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wdth,wght@0,62..125,400..900;1,62..125,400..900&display=swap" rel="stylesheet">
<style>${css}</style></head><body>${body}</body></html>`

// headless Chrome over the DevTools protocol
const PORT = 9334
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars',
  '--allow-file-access-from-files', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'beh-'))}`, 'about:blank'], { stdio: 'ignore' })
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
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id) })
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value

const tmp = mkdtempSync(join(tmpdir(), 'beh-html-'))
for (const [name, body] of Object.entries(cards)) {
  const file = join(tmp, `${name}.html`)
  writeFileSync(file, html(body))
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: pathToFileURL(file).href })
  await sleep(800)
  await evaluate('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))))')
  const h = await evaluate('Math.ceil(document.querySelector(".card").getBoundingClientRect().height)')
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: h, deviceScaleFactor: 2, mobile: false })
  await sleep(300)
  const { result } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(result.data, 'base64'))
  console.log(`${name}: 2800 x ${h * 2}`)
}
ws.close()
chrome.kill()
