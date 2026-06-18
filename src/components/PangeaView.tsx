/** 🌍 Continental Drift view — one globe you scrub through deep time, from the
 * Pangaea supercontinent (~340 Mya) to today. Self-contained three.js scene
 * (sphere + starfield + its own controls) with the Scotese PALEOMAP frames
 * cross-faded by a shader, a time scrubber, milestone captions and the science.
 * Paleogeographic maps © Scotese et al., PALEOMAP / Zenodo (CC-BY-4.0). */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// frames live every 10 Myr from 0 (today) to 340 Mya (public/planets/paleo)
const STEP = 10
const MAX_MA = 340
const FRAMES = Array.from({ length: MAX_MA / STEP + 1 }, (_, i) => i * STEP) // 0,10,…,340
const pad = (n: number) => String(n).padStart(3, '0')

// milestone captions (Ma → what the map shows), shown for the nearest stage
const MILESTONES: { ma: number; title: string; text: string }[] = [
  { ma: 335, title: 'Pangaea forming', text: 'The last great supercontinent locks together; one world-ocean, Panthalassa, surrounds it.' },
  { ma: 250, title: 'Peak Pangaea', text: 'All land is joined pole to pole at the Permian–Triassic boundary — Earth’s largest mass extinction.' },
  { ma: 200, title: 'The rift begins', text: 'The Central Atlantic opens; Pangaea starts to tear apart.' },
  { ma: 150, title: 'Gondwana splits', text: 'The South Atlantic opens as South America and Africa separate.' },
  { ma: 100, title: 'A familiar shape', text: 'The Atlantic widens; India breaks free and races north across the Tethys.' },
  { ma: 50, title: 'India hits Asia', text: 'The collision begins to raise the Himalaya; continents near their modern positions.' },
  { ma: 0, title: 'Today', text: 'The Atlantic still widens ~2 cm/yr, the Pacific is closing, India still pushes north.' },
]
const nearestMilestone = (ma: number) =>
  MILESTONES.reduce((best, m) => (Math.abs(m.ma - ma) < Math.abs(best.ma - ma) ? m : best))

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`
const FRAG = /* glsl */ `
uniform sampler2D texA; uniform sampler2D texB; uniform float mixf; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN;
void main(){
  vec3 col = mix(texture2D(texA, vUv).rgb, texture2D(texB, vUv).rgb, mixf);
  float lit = 0.62 + 0.38 * clamp(dot(normalize(vN), normalize(sunDir)), 0.0, 1.0);
  gl_FragColor = vec4(col * lit, 1.0);
}`

export function PangeaView({ onClose }: { onClose: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const maRef = useRef(MAX_MA) // start at Pangaea
  const [ma, setMa] = useState(MAX_MA)
  const [playing, setPlaying] = useState(true)

  // keep a ref in sync so the rAF loop reads the latest scrub value
  useEffect(() => {
    maRef.current = ma
  }, [ma])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let disposed = false
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 2000)
    camera.position.set(0, 60, 320)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35
    controls.minDistance = 150
    controls.maxDistance = 600
    controls.enablePan = false

    const loader = new THREE.TextureLoader()
    const starTex = loader.load('stars-milky-way-4k.webp')
    starTex.mapping = THREE.EquirectangularReflectionMapping
    starTex.colorSpace = THREE.SRGBColorSpace
    scene.background = starTex

    // lazily-loaded frame textures (null until fetched), with a placeholder
    const textures: (THREE.Texture | null)[] = FRAMES.map(() => null)
    const blank = new THREE.DataTexture(new Uint8Array([10, 16, 30, 255]), 1, 1)
    blank.needsUpdate = true
    const getTex = (i: number): THREE.Texture => {
      if (textures[i]) return textures[i] as THREE.Texture
      const t = loader.load(`planets/paleo/paleo-${pad(FRAMES[i])}.webp`)
      t.colorSpace = THREE.SRGBColorSpace
      textures[i] = t
      return t
    }

    const uniforms = {
      texA: { value: blank as THREE.Texture },
      texB: { value: blank as THREE.Texture },
      mixf: { value: 0 },
      sunDir: { value: new THREE.Vector3(0.6, 0.25, 1).normalize() },
    }
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG })
    const globe = new THREE.Mesh(new THREE.SphereGeometry(100, 96, 64), mat)
    globe.rotation.y = -Math.PI / 2 // align texture seam to the back
    scene.add(globe)

    const onResize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let raf = 0
    const loop = () => {
      if (disposed) return
      const m = maRef.current
      const f = m / STEP // continuous frame index
      const i = Math.min(Math.floor(f), FRAMES.length - 2)
      uniforms.texA.value = getTex(i)
      uniforms.texB.value = getTex(i + 1)
      uniforms.mixf.value = f - i
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      globe.geometry.dispose()
      mat.dispose()
      starTex.dispose()
      blank.dispose()
      for (const t of textures) t?.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [])

  // playback: march from Pangaea (340) toward today (0), then hold
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      if (last) {
        setMa((prev) => {
          const next = prev - ((t - last) / 1000) * 14 // ~14 Myr per second
          if (next <= 0) {
            setPlaying(false)
            return 0
          }
          return next
        })
      }
      last = t
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const milestone = nearestMilestone(ma)
  const label = ma < 1 ? 'today' : `${Math.round(ma)} million years ago`

  return (
    <div className="fixed inset-0 z-50 bg-[#01030a]">
      <div ref={mountRef} className="absolute inset-0" />

      {/* title + back */}
      <div className="pointer-events-none absolute inset-x-0 top-4 flex flex-col items-center gap-1">
        <span className="vf-eyebrow">◂ continental drift ▸</span>
        <h1 className="font-[var(--font-display)] text-lg tracking-wide text-slate-100">
          {milestone.title}
        </h1>
        <p className="font-[var(--font-mono)] text-2xl text-amber-300">{label}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="hud pointer-events-auto absolute top-4 left-4 px-3 py-1.5 text-xs text-slate-200"
      >
        ← back to Earth
      </button>

      {/* caption card */}
      <div className="hud pointer-events-none absolute top-20 right-4 w-72 px-4 py-3">
        <h2 className="text-xs font-semibold tracking-wide text-amber-300 uppercase">
          {milestone.title}
        </h2>
        <p className="mt-1 text-xs text-slate-300">{milestone.text}</p>
        <p className="mt-2 text-[10px] text-slate-500">
          Maps © Scotese et al., PALEOMAP (Zenodo) · CC-BY-4.0
        </p>
      </div>

      {/* timeline scrubber */}
      <div className="hud pointer-events-auto absolute inset-x-0 bottom-6 mx-auto flex w-[min(40rem,92vw)] items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            if (ma < 1) setMa(MAX_MA)
            setPlaying((p) => !p)
          }}
          className="text-lg text-slate-200"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span className="font-[var(--font-mono)] text-[10px] text-slate-500">340 Ma</span>
        <input
          type="range"
          min={0}
          max={MAX_MA}
          step={1}
          // slider left = oldest (Pangaea), right = today → invert the value
          value={MAX_MA - ma}
          onChange={(e) => {
            setPlaying(false)
            setMa(MAX_MA - Number(e.target.value))
          }}
          className="grow accent-amber-400"
        />
        <span className="font-[var(--font-mono)] text-[10px] text-slate-500">today</span>
      </div>
    </div>
  )
}
