/** 🌍 Continental Drift view — one globe you scrub through deep time, from the
 * Pangaea supercontinent (~340 Mya) to today. Self-contained three.js scene
 * (sphere + starfield + its own controls) with the Scotese PALEOMAP frames
 * cross-faded by a shader, a time scrubber, milestone captions and the science.
 * Paleogeographic maps © Scotese et al., PALEOMAP / Zenodo (CC-BY-4.0). */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// past frames live every 10 Myr from 0 (today) to 340 Mya (public/planets/paleo);
// the future is one reprojected frame at −250 Myr (Pangaea Proxima)
const STEP = 10
const MAX_MA = 340
const FUTURE_MA = -250
const FRAMES = Array.from({ length: MAX_MA / STEP + 1 }, (_, i) => i * STEP) // 0,10,…,340
const pad = (n: number) => String(n).padStart(3, '0')

// milestone captions (Ma → what the map shows; negative = future), nearest wins
const MILESTONES: { ma: number; title: string; text: string }[] = [
  { ma: 335, title: 'Pangaea forming', text: 'The last great supercontinent locks together; one world-ocean, Panthalassa, surrounds it.' },
  { ma: 250, title: 'Peak Pangaea', text: 'All land is joined pole to pole at the Permian–Triassic boundary — Earth’s largest mass extinction.' },
  { ma: 200, title: 'The rift begins', text: 'The Central Atlantic opens; Pangaea starts to tear apart.' },
  { ma: 150, title: 'Gondwana splits', text: 'The South Atlantic opens as South America and Africa separate.' },
  { ma: 100, title: 'A familiar shape', text: 'The Atlantic widens; India breaks free and races north across the Tethys.' },
  { ma: 50, title: 'India hits Asia', text: 'The collision begins to raise the Himalaya; continents near their modern positions.' },
  { ma: 0, title: 'Today', text: 'The Atlantic still widens ~2 cm/yr, the Pacific is closing, India still pushes north.' },
  { ma: -100, title: 'The Atlantic turns', text: 'In one leading scenario the Atlantic stops widening and begins to close again.' },
  { ma: -250, title: 'Pangaea Proxima', text: 'The Atlantic shuts and the continents reunite into a new supercontinent — a projected future.' },
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
  // start paused on Pangaea — the user presses ▶ (or scrubs) to set it in motion
  const [playing, setPlaying] = useState(false)

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
    // phones/tablets: lighter renderer to stay well inside the mobile GPU budget
    const mobile =
      matchMedia('(pointer: coarse)').matches && matchMedia('(max-width: 1024px)').matches
    const renderer = new THREE.WebGLRenderer({
      antialias: !mobile,
      powerPreference: mobile ? 'low-power' : 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2))
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
    // projected future: morph frames every 50 Myr (today → Pangaea Proxima),
    // index k = 1..5 → paleo-fut050…fut250; k=0 is today (the detailed frame)
    const futureTex: (THREE.Texture | null)[] = [null, null, null, null, null, null]
    const getFutureTex = (k: number): THREE.Texture => {
      if (k <= 0) return getTex(0)
      if (futureTex[k]) return futureTex[k] as THREE.Texture
      const t = loader.load(`planets/paleo/paleo-fut${pad(k * 50)}.webp`)
      t.colorSpace = THREE.SRGBColorSpace
      futureTex[k] = t
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
      if (m <= 0) {
        // future: step through the 50-Myr morph frames (today → Pangaea Proxima)
        const g = Math.min(-m / 50, 5) // 0..5 across the future steps
        const k = Math.min(Math.floor(g), 4)
        uniforms.texA.value = getFutureTex(k)
        uniforms.texB.value = getFutureTex(k + 1)
        uniforms.mixf.value = g - k
      } else {
        const f = m / STEP // continuous frame index
        const i = Math.min(Math.floor(f), FRAMES.length - 2)
        uniforms.texA.value = getTex(i)
        uniforms.texB.value = getTex(i + 1)
        uniforms.mixf.value = f - i
      }
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
      for (const t of futureTex) t?.dispose()
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
          if (next <= FUTURE_MA) {
            setPlaying(false)
            return FUTURE_MA
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
  const label =
    Math.abs(ma) < 1
      ? 'today'
      : ma > 0
        ? `${Math.round(ma)} million years ago`
        : `${Math.round(-ma)} million years from now`

  return (
    <div className="fixed inset-0 z-50 h-dvh w-dvw bg-[#01030a]">
      <div ref={mountRef} className="absolute inset-0" />

      {/* title + date (centred; sits below the back button row on phones) */}
      <div className="pointer-events-none absolute inset-x-0 top-14 flex flex-col items-center gap-0.5 px-4 text-center sm:top-4 sm:gap-1">
        <span className="vf-eyebrow">◂ continental drift ▸</span>
        <h1 className="font-[var(--font-display)] text-base tracking-wide text-slate-100 sm:text-lg">
          {milestone.title}
        </h1>
        <p className="font-[var(--font-mono)] text-xl text-amber-300 sm:text-2xl">{label}</p>
        {/* on phones the caption text lives here (the side card is desktop-only) */}
        <p className="mt-1 max-w-md text-xs text-slate-300 sm:hidden">{milestone.text}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        style={{ position: 'absolute' }}
        className="hud pointer-events-auto top-3 left-3 px-2.5 py-1.5 text-xs text-slate-200 sm:top-4 sm:left-4"
      >
        <span className="sm:hidden">←</span>
        <span className="hidden sm:inline">← back to Earth</span>
      </button>

      {/* caption card — desktop only (top-right); phones show the text in the header */}
      <div
        style={{ position: 'absolute' }}
        className="hud pointer-events-none top-20 right-4 hidden w-72 px-4 py-3 sm:block"
      >
        <h2 className="text-xs font-semibold tracking-wide text-amber-300 uppercase">
          {milestone.title}
        </h2>
        <p className="mt-1 text-xs text-slate-300">{milestone.text}</p>
        <p className="mt-2 text-[10px] text-slate-500">
          {ma < 0
            ? 'Future = projected concept · Pangaea Proxima, Wikimedia Commons · CC-BY-SA 4.0'
            : 'Maps © Scotese et al., PALEOMAP (Zenodo) · CC-BY-4.0'}
        </p>
      </div>
      {/* compact attribution for phones (bottom, above the scrubber) */}
      <p className="pointer-events-none absolute inset-x-0 bottom-20 px-4 text-center text-[10px] text-slate-500 sm:hidden">
        {ma < 0
          ? 'Pangaea Proxima · Wikimedia · CC-BY-SA 4.0 — projected'
          : 'Maps © Scotese, PALEOMAP · CC-BY-4.0'}
      </p>

      {/* timeline scrubber: Pangaea (340 Ma) → today → projected future (+250 My) */}
      <div
        style={{ position: 'absolute' }}
        className="hud pointer-events-auto inset-x-0 bottom-5 mx-auto flex w-[min(42rem,94vw)] items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4"
      >
        <button
          type="button"
          onClick={() => {
            if (ma <= FUTURE_MA) setMa(MAX_MA)
            setPlaying((p) => !p)
          }}
          className="shrink-0 text-lg text-slate-200"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <span className="hidden shrink-0 font-[var(--font-mono)] text-[10px] text-slate-500 sm:inline">
          340 Ma
        </span>
        <input
          type="range"
          min={0}
          max={MAX_MA - FUTURE_MA}
          step={1}
          aria-label="Geological time"
          // slider left = oldest (Pangaea), right = projected future → invert
          value={MAX_MA - ma}
          onChange={(e) => {
            setPlaying(false)
            setMa(MAX_MA - Number(e.target.value))
          }}
          className="grow accent-amber-400"
        />
        <span className="hidden shrink-0 font-[var(--font-mono)] text-[10px] text-slate-500 sm:inline">
          +250 My
        </span>
      </div>
    </div>
  )
}
