import { use } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'

// Binary assets (the tire GLB and the studio HDRI), loaded into memory and parsed there.
//
// Normal builds fetch the files as-is, relative to the page (vite base './'). The
// claude.ai Artifact host only serves standard web types (no .glb / .hdr), so the
// artifact build (VITE_PORTABLE_ASSETS=1, see scripts/build-artifact.mjs) ships them as
// base64 text. Either way the bytes are parsed in memory: no data:/blob: URL fetches,
// which a strict content-security policy can block.

const BASE = import.meta.env.BASE_URL
const PORTABLE = import.meta.env.VITE_PORTABLE_ASSETS === '1'

export const assetUrl = (path) => `${BASE}${path}`

const cache = new Map()
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}

function base64ToBuffer(b64) {
  const bin = atob(b64.trim())
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

function fetchBuffer(path) {
  return once(`buf:${path}`, async () => {
    const url = assetUrl(PORTABLE ? `${path}.b64.txt` : path)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`)
    return PORTABLE ? base64ToBuffer(await response.text()) : response.arrayBuffer()
  })
}

function loadGLTF(path, configure) {
  return once(`gltf:${path}`, async () => {
    const loader = new GLTFLoader()
    configure?.(loader)
    return loader.parseAsync(await fetchBuffer(path), '')
  })
}

function loadHDR(path) {
  return once(`hdr:${path}`, async () => {
    const data = new HDRLoader().parse(await fetchBuffer(path))
    const texture = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type)
    texture.colorSpace = THREE.LinearSRGBColorSpace
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.minFilter = texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.flipY = true
    texture.needsUpdate = true
    return texture
  })
}

/** Parsed glTF (suspends while loading). */
export const useGLTFAsset = (path, configure) => use(loadGLTF(path, configure))
/** Equirectangular HDR environment texture (suspends while loading). */
export const useHDRAsset = (path) => use(loadHDR(path))

/** Start both downloads right away instead of one after the other. */
export function preloadAssets({ gltf, hdr, configure }) {
  loadGLTF(gltf, configure).catch(() => {})
  loadHDR(hdr).catch(() => {})
}
