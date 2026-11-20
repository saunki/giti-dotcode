import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'

// Ground contact shadow / ambient occlusion, baked from the scene itself.
//
// An orthographic camera under the floor looks up and records, per texel, how close the
// nearest geometry is to the ground. Geometry touching the floor (the tire's contact
// patch) is black; it fades out with height. Two blurred copies are combined: a tight
// one for the dark contact line and a wide, faint one for the soft occlusion the
// Redshift GI produces. drei's <ContactShadows> renders empty with three r186, so
// this replaces it. The scene is static, so it renders a few frames and then stops.

const heightMaterial = (falloff, exponent) =>
  new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { falloff: { value: falloff }, exponent: { value: exponent } },
    vertexShader: /* glsl */ `
      varying float vHeight;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vHeight = world.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      uniform float falloff;
      uniform float exponent;
      varying float vHeight;
      void main() {
        float d = 1.0 - clamp(vHeight / falloff, 0.0, 1.0);
        gl_FragColor = vec4(vec3(pow(d, exponent)), 1.0);
      }`,
  })

const blurMaterial = new THREE.ShaderMaterial({
  uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tex;
    uniform vec2 dir;
    varying vec2 vUv;
    void main() {
      // 13-tap gaussian along dir
      float w[7];
      w[0] = 0.1964825501511404; w[1] = 0.2969069646728344 * 0.5; w[2] = 0.09447039785044732 * 0.5;
      w[3] = 0.010381362401148057 * 0.5; w[4] = 0.0; w[5] = 0.0; w[6] = 0.0;
      vec4 sum = texture2D(tex, vUv) * 0.2;
      float total = 0.2;
      for (int i = 1; i <= 6; i++) {
        float wt = exp(-float(i * i) / 12.0) * 0.2;
        sum += texture2D(tex, vUv + dir * float(i)) * wt;
        sum += texture2D(tex, vUv - dir * float(i)) * wt;
        total += 2.0 * wt;
      }
      gl_FragColor = sum / total;
    }`,
})

// several small-step passes instead of two big ones: same radius, no visible tap streaks
const BLUR_PASSES = 6

function makeTarget(size) {
  return new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType })
}

export default function ContactShadow({
  size = 1.6, // metres covered on the floor
  resolution = 512,
  // blur is in texels (512 over 1.6 m ≈ 3 mm each); effective radius ≈ blur x 2
  tight = { falloff: 0.05, exponent: 2, blur: 4, opacity: 1 },
  wide = { falloff: 0.6, exponent: 1, blur: 40, opacity: 1.6 },
  color = '#1a1714',
  frames = 4,
  // optional: object to follow after the bake (x/z position, heading, and height above restY)
  follow,
  restY = 0,
}) {
  const { gl, scene } = useThree()
  const planeRef = useRef()
  const count = useRef(0)

  const res = useMemo(() => {
    // camera slightly below the floor so the part of the tread pressed into it counts as contact
    const camera = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, 2)
    camera.position.set(0, -0.1, 0)
    camera.up.set(0, 0, -1)
    camera.lookAt(0, 1, 0)
    return {
      camera,
      quad: new FullScreenQuad(blurMaterial),
      tightMat: heightMaterial(tight.falloff, tight.exponent),
      wideMat: heightMaterial(wide.falloff, wide.exponent),
      tightA: makeTarget(resolution),
      tightB: makeTarget(resolution),
      wideA: makeTarget(resolution),
      wideB: makeTarget(resolution),
    }
  }, [size, resolution, tight.falloff, tight.exponent, wide.falloff, wide.exponent])

  const planeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          tightTex: { value: res.tightA.texture },
          wideTex: { value: res.wideA.texture },
          tightOpacity: { value: tight.opacity },
          wideOpacity: { value: wide.opacity },
          color: { value: new THREE.Color(color) },
          lift: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tightTex;
          uniform sampler2D wideTex;
          uniform float tightOpacity;
          uniform float wideOpacity;
          uniform vec3 color;
          uniform float lift;
          varying vec2 vUv;
          void main() {
            // the bake camera looks up from below, which mirrors X relative to the plane
            vec2 uv = vec2(1.0 - vUv.x, vUv.y);
            // when the object leaves the ground the contact line vanishes first, the soft pool fades slower
            float t = texture2D(tightTex, uv).r * tightOpacity * (1.0 - smoothstep(0.0, 0.08, lift));
            float w = texture2D(wideTex, uv).r * wideOpacity * (1.0 - smoothstep(0.0, 1.2, lift));
            // fade to nothing at the edge of the baked area
            float edge = 1.0 - smoothstep(0.35, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
            float a = (1.0 - (1.0 - t) * (1.0 - clamp(w, 0.0, 0.75))) * edge;
            gl_FragColor = vec4(color, a);
            #include <colorspace_fragment>
          }`,
      }),
    [res, tight.opacity, wide.opacity, color],
  )

  useEffect(
    () => () => {
      ;['tightA', 'tightB', 'wideA', 'wideB'].forEach((k) => res[k].dispose())
      res.tightMat.dispose()
      res.wideMat.dispose()
      res.quad.dispose()
      planeMaterial.dispose()
    },
    [res, planeMaterial],
  )

  const bake = (material, target, scratch, blur) => {
    const prev = { override: scene.overrideMaterial, background: scene.background, fog: scene.fog }
    planeRef.current.visible = false
    scene.overrideMaterial = material
    scene.background = null
    scene.fog = null
    gl.setRenderTarget(target)
    gl.setClearColor(0x000000, 1)
    gl.clear()
    gl.render(scene, res.camera)
    scene.overrideMaterial = prev.override
    scene.background = prev.background
    scene.fog = prev.fog
    planeRef.current.visible = true

    // two separable blur passes, ping-ponging between the targets
    const texel = 1 / resolution
    for (let i = 0; i < BLUR_PASSES; i++) {
      blurMaterial.uniforms.tex.value = target.texture
      blurMaterial.uniforms.dir.value.set((blur * texel) / (3 * Math.sqrt(BLUR_PASSES / 2)), 0)
      gl.setRenderTarget(scratch)
      res.quad.render(gl)
      blurMaterial.uniforms.tex.value = scratch.texture
      blurMaterial.uniforms.dir.value.set(0, (blur * texel) / (3 * Math.sqrt(BLUR_PASSES / 2)))
      gl.setRenderTarget(target)
      res.quad.render(gl)
    }
    gl.setRenderTarget(null)
  }

  useFrame(() => {
    const target = follow?.current
    if (target && planeRef.current && count.current >= frames) {
      // the footprint is baked at rest; afterwards it just travels with the object
      const lift = Math.max(0, target.position.y - restY)
      planeRef.current.position.set(target.position.x, 0.002, target.position.z)
      planeRef.current.rotation.set(-Math.PI / 2, 0, target.rotation.y)
      planeRef.current.scale.setScalar(1 + lift * 0.5) // spreads out as it rises
      planeMaterial.uniforms.lift.value = lift
    }
    if (count.current >= frames || !planeRef.current) return
    count.current++
    const clear = gl.getClearColor(new THREE.Color())
    const clearAlpha = gl.getClearAlpha()
    // the backdrop is the floor itself; keep it out of the bake
    const hidden = []
    scene.traverse((o) => {
      if (o.isMesh && (o.name === 'Backdrop' || o.userData.noContactShadow) && o.visible) {
        o.visible = false
        hidden.push(o)
      }
    })
    bake(res.tightMat, res.tightA, res.tightB, tight.blur)
    bake(res.wideMat, res.wideA, res.wideB, wide.blur)
    hidden.forEach((o) => (o.visible = true))
    gl.setClearColor(clear, clearAlpha)
  })

  return (
    <mesh ref={planeRef} rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} material={planeMaterial} renderOrder={1}>
      <planeGeometry args={[size, size]} />
    </mesh>
  )
}
