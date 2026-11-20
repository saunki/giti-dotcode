// Packs the Vite build (dist/) into dist-artifact/ for publishing as a claude.ai Artifact.
// Usage: npm run build:artifact  (vite build with VITE_PORTABLE_ASSETS=1, then this script)
//
// The Artifact host wraps the page in its own <html>/<head>/<body>, so the page is a
// fragment: title + inlined CSS + root div + inlined JS module. Models, textures and
// the HDRI stay separate files, fetched with relative URLs (vite base './').
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const OUT = 'dist-artifact'

const html = readFileSync(join(DIST, 'playground.html'), 'utf8') // the physics playground
const jsFile = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1]
const cssFile = html.match(/href="\.\/(assets\/[^"]+\.css)"/)?.[1]
const title = html.match(/<title>([^<]*)<\/title>/)[1]

const js = readFileSync(join(DIST, jsFile), 'utf8').replaceAll('</script', '<\\/script')
const css = cssFile ? readFileSync(join(DIST, cssFile), 'utf8') : ''

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
writeFileSync(
  join(OUT, 'index.html'),
  `<title>${title}</title>
<style>${css}</style>
<div id="root"><p style="font:14px system-ui,sans-serif;color:#000000;padding:24px">Loading the Giti playground…</p></div>
<script type="module">${js}</script>
`,
)
for (const dir of ['models', 'textures', 'hdri']) cpSync(join(DIST, dir), join(OUT, dir), { recursive: true })
// the host doesn't serve .glb/.hdr: ship base64 text copies instead (decoded in src/assets.js)
for (const file of ['models/tire.glb', 'hdri/studio_2k.hdr']) {
  writeFileSync(join(OUT, file + '.b64.txt'), readFileSync(join(OUT, file)).toString('base64'))
  rmSync(join(OUT, file))
}

const files = readdirSync(OUT, { recursive: true }).filter((f) => /\.\w+$/.test(f))
console.log(`${OUT}: ${files.length} files, page ${(readFileSync(join(OUT, 'index.html')).length / 1e6).toFixed(2)} MB`)
