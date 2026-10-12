/** 🌍 Continental Drift view — one globe you scrub through deep time, from the
 * Pangaea supercontinent (~340 Mya) to today. Self-contained three.js scene
 * (sphere + starfield + its own controls) with the Scotese PALEOMAP frames
 * cross-faded by a shader, a time scrubber, milestone captions and the science.
 * Paleogeographic maps © Scotese et al., PALEOMAP / Zenodo (CC-BY-4.0). */

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { makeAtmosphereMaterial } from './globe/planetEffects'
import { t } from '../lib/i18n'

// past frames live every 5 Myr from 0 (today) to 340 Mya (public/planets/paleo,
// restyled by scripts/build-drift-frames.mjs; 2048 px, phones read the 1024 px sd/ set);
// the future is one reprojected frame at −250 Myr (Pangaea Proxima)
const STEP = 5 // 5-Myr frames → the drift reads as smooth motion, not stepped
const MAX_MA = 340
const FUTURE_MA = -250
const FRAMES = Array.from({ length: MAX_MA / STEP + 1 }, (_, i) => i * STEP) // 0,5,…,340
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

// geological periods on the scrubber, coloured with the official ICS chart
// colours (International Commission on Stratigraphy); start/end in Ma
const PERIODS: { name: string; short: string; from: number; to: number; color: string }[] = [
  { name: 'Carboniferous', short: 'C', from: 340, to: 298.9, color: '#67a599' },
  { name: 'Permian', short: 'P', from: 298.9, to: 251.9, color: '#f04028' },
  { name: 'Triassic', short: 'T', from: 251.9, to: 201.4, color: '#812b92' },
  { name: 'Jurassic', short: 'J', from: 201.4, to: 145, color: '#34b2c9' },
  { name: 'Cretaceous', short: 'K', from: 145, to: 66, color: '#7fc64e' },
  { name: 'Paleogene', short: 'Pg', from: 66, to: 23, color: '#fd9a52' },
  { name: 'Neogene', short: 'N', from: 23, to: 0, color: '#ffe619' },
  { name: 'Future', short: '?', from: 0, to: FUTURE_MA, color: '#64748b' },
]
const periodAt = (ma: number) =>
  ma < -0.5 ? PERIODS[PERIODS.length - 1] : (PERIODS.slice(0, -1).find((p) => ma <= p.from && ma > p.to) ?? PERIODS[6])
/** Slider position (0 = Pangaea, 1 = +250 My) of a time in Ma. */
const pos = (ma: number) => (MAX_MA - ma) / (MAX_MA - FUTURE_MA)

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`
// cross-faded paleo frames, lit like Earth from orbit: a soft terminator, sun
// glint on the oceans only (water = blue-dominant pixels of the restyled
// frames) and a blue haze thickening toward the limb
const FRAG = /* glsl */ `
uniform sampler2D texA; uniform sampler2D texB; uniform float mixf; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 col = mix(texture2D(texA, vUv).rgb, texture2D(texB, vUv).rgb, mixf);
  vec3 n = normalize(vN), l = normalize(sunDir), v = normalize(cameraPosition - vW);
  float day = smoothstep(-0.3, 0.55, dot(n, l));
  float water = smoothstep(0.03, 0.1, col.b - max(col.r, col.g * 0.92));
  vec3 h = normalize(l + v);
  float nh = max(dot(n, h), 0.0);
  float glint = water * (pow(nh, 140.0) * 0.4 + pow(nh, 18.0) * 0.035);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6);
  vec3 lit = col * (0.13 + 0.95 * day) + vec3(1.0, 0.93, 0.8) * glint * day;
  lit = mix(lit, vec3(0.32, 0.58, 1.0) * (0.15 + 0.85 * day), rim * 0.6);
  gl_FragColor = vec4(lit, 1.0);
  #include <colorspace_fragment>
}`
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D map; uniform vec3 sunDir; uniform float opacity;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec4 c = texture2D(map, vUv);
  float day = smoothstep(-0.2, 0.5, dot(normalize(vN), normalize(sunDir)));
  gl_FragColor = vec4(vec3(0.96) * (0.2 + 0.8 * day), c.a * opacity * (0.35 + 0.65 * day));
  #include <colorspace_fragment>
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
    // frame the whole globe whatever the aspect — a portrait phone used to crop it
    const fitDistance = () => {
      const v = THREE.MathUtils.degToRad(camera.fov / 2)
      const h = Math.atan(Math.tan(v) * camera.aspect)
      return Math.max(375, 118 / Math.sin(Math.min(v, h)))
    }
    camera.position.set(0, 0.147, 1).normalize().multiplyScalar(fitDistance())
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
    // anisotropic filtering keeps the paleo maps crisp at grazing angles —
    // the single biggest visual upgrade this view can buy on any GPU
    const maxAniso = renderer.capabilities.getMaxAnisotropy()

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35
    controls.minDistance = 150
    controls.maxDistance = Math.max(600, fitDistance() * 1.4)
    controls.enablePan = false

    const loader = new THREE.TextureLoader()
    const starTex = loader.load('stars-milky-way-4k.webp')
    starTex.mapping = THREE.EquirectangularReflectionMapping
    starTex.colorSpace = THREE.SRGBColorSpace
    scene.background = starTex

    // lazily-loaded frame textures (null until fetched), with a placeholder.
    // Only a rolling window around the playhead stays decoded — a full playback
    // used to pin every frame until unmount (69 × 2048² with mips ≈ 0.8 GB on
    // desktop, ~200 MB of 1024² on phones); re-entering a frame reloads
    // instantly from the SW cache.
    const KEEP_RADIUS = mobile ? 5 : 8
    const dir = mobile ? 'planets/paleo/sd/' : 'planets/paleo/'
    // bump when the frame artwork is regenerated: the service worker caches
    // these CacheFirst for 30 days, so unchanged URLs would keep old frames
    const REV = '?r=2'
    const textures: (THREE.Texture | null)[] = FRAMES.map(() => null)
    const blank = new THREE.DataTexture(new Uint8Array([10, 16, 30, 255]), 1, 1)
    blank.needsUpdate = true
    const getTex = (i: number): THREE.Texture => {
      for (let j = 0; j < textures.length; j++) {
        if (textures[j] && Math.abs(j - i) > KEEP_RADIUS) {
          textures[j]?.dispose()
          textures[j] = null
        }
      }
      if (textures[i]) return textures[i] as THREE.Texture
      const t = loader.load(`${dir}paleo-${pad(FRAMES[i])}.webp${REV}`)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = maxAniso
      textures[i] = t
      return t
    }
    // projected future: morph frames every 50 Myr (today → Pangaea Proxima),
    // index k = 1..5 → paleo-fut050…fut250; k=0 is today (the detailed frame)
    const futureTex: (THREE.Texture | null)[] = [null, null, null, null, null, null]
    const getFutureTex = (k: number): THREE.Texture => {
      if (k <= 0) return getTex(0)
      if (futureTex[k]) return futureTex[k] as THREE.Texture
      const t = loader.load(`${dir}paleo-fut${pad(k * 50)}.webp${REV}`)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = maxAniso
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
    // soft blue fresnel rim — the same atmosphere shell the solar planets wear;
    // it turns a textured ball into "Earth seen from orbit"
    const atmoMat = makeAtmosphereMaterial('#6fb7ff', 3.2, 0.7)
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(104, 64, 64), atmoMat)
    scene.add(atmo)
    // a thin, slowly drifting cloud deck — the difference between a map on a
    // ball and a living planet
    const cloudTex = loader.load('clouds.webp')
    cloudTex.colorSpace = THREE.SRGBColorSpace
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: cloudTex }, sunDir: uniforms.sunDir, opacity: { value: 0.42 } },
      vertexShader: VERT,
      fragmentShader: CLOUD_FRAG,
      transparent: true,
      depthWrite: false,
    })
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(101.2, mobile ? 48 : 96, mobile ? 32 : 64), cloudMat)
    clouds.renderOrder = 1
    scene.add(clouds)

    const onResize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      controls.maxDistance = Math.max(600, fitDistance() * 1.4)
      if (camera.position.length() < fitDistance() * 0.9) camera.position.setLength(fitDistance())
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let raf = 0
    const right = new THREE.Vector3()
    const up = new THREE.Vector3()
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
      clouds.rotation.y += 0.00025
      // key light rides just off the camera axis — the face you look at is
      // always lit, the offset keeps a soft terminator for depth
      // (offset in camera space, so the terminator stays on the right as it orbits)
      right.setFromMatrixColumn(camera.matrixWorld, 0)
      up.setFromMatrixColumn(camera.matrixWorld, 1)
      uniforms.sunDir.value
        .copy(camera.position)
        .normalize()
        .addScaledVector(right, 0.75)
        .addScaledVector(up, 0.35)
        .normalize()
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
      atmo.geometry.dispose()
      atmoMat.dispose()
      clouds.geometry.dispose()
      cloudMat.dispose()
      cloudTex.dispose()
      starTex.dispose()
      blank.dispose()
      for (const t of textures) t?.dispose()
      for (const t of futureTex) t?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
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
          const next = prev - ((t - last) / 1000) * 9 // ~9 Myr/s — a graceful glide
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
  const mIndex = MILESTONES.indexOf(milestone)
  const period = periodAt(ma)
  const future = ma < -0.5
  const label =
    Math.abs(ma) < 1
      ? t('today')
      : ma > 0
        ? t('{n} million years ago', { n: Math.round(ma) })
        : t('{n} million years from now', { n: Math.round(-ma) })
  const jump = (to: number) => {
    setPlaying(false)
    setMa(to)
  }
  const credit = future
    ? t('Pangaea Proxima · Wikimedia · CC-BY-SA 4.0 — projected')
    : t('Maps © Scotese, PALEOMAP · CC-BY-4.0')

  return (
    <div className="fixed inset-0 z-50 h-dvh w-dvw overflow-hidden bg-[#01030a]">
      <div ref={mountRef} className="absolute inset-0" />
      {/* cinematic vignette — pulls the eye to the globe, calms the star field */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(1,3,10,0.75)_100%)]" />

      {/* header: eyebrow · period chip · big date */}
      <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)_+_3.5rem)] flex flex-col items-center gap-1.5 px-4 text-center sm:top-4">
        <span className="vf-eyebrow">◂ {t('continental drift')} ▸</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-[var(--font-mono)] text-[10px] tracking-[0.18em] uppercase backdrop-blur-sm"
          style={{ borderColor: `${period.color}80`, color: period.color, background: `${period.color}14` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: period.color, boxShadow: `0 0 8px ${period.color}` }} />
          {t(period.name)}
        </span>
        <p className="font-[var(--font-display)] text-3xl font-light tracking-tight text-slate-50 tabular-nums drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-4xl">
          {label}
        </p>
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          left: 'calc(env(safe-area-inset-left, 0px) + 0.75rem)',
        }}
        className="hud pointer-events-auto px-3 py-2 text-xs text-slate-200 sm:px-2.5 sm:py-1.5"
      >
        <span className="sm:hidden">← {t('Earth')}</span>
        <span className="hidden sm:inline">← {t('back to Earth')}</span>
      </button>

      {/* story card: milestone n/9 with prev/next — right column on desktop,
          a compact strip above the timeline on phones */}
      <div
        style={{ position: 'absolute' }}
        className="hud pointer-events-auto inset-x-3 bottom-[calc(env(safe-area-inset-bottom,0px)_+_7.75rem)] px-4 py-3 sm:inset-x-auto sm:top-1/2 sm:right-6 sm:bottom-auto sm:w-80 sm:-translate-y-1/2 sm:px-5 sm:py-4"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-[var(--font-mono)] text-[10px] tracking-[0.2em] text-slate-500 uppercase">
            {String(mIndex + 1).padStart(2, '0')} / {String(MILESTONES.length).padStart(2, '0')}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={mIndex === 0}
              onClick={() => jump(MILESTONES[mIndex - 1].ma)}
              aria-label={t('Previous chapter')}
              className="h-7 w-7 rounded-full border border-white/10 text-slate-300 transition hover:border-amber-300/60 hover:text-amber-200 disabled:opacity-30"
            >
              ‹
            </button>
            <button
              type="button"
              disabled={mIndex === MILESTONES.length - 1}
              onClick={() => jump(MILESTONES[mIndex + 1].ma)}
              aria-label={t('Next chapter')}
              className="h-7 w-7 rounded-full border border-white/10 text-slate-300 transition hover:border-amber-300/60 hover:text-amber-200 disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
        <h2 className="mt-1.5 font-[var(--font-display)] text-base text-amber-200 sm:mt-2 sm:text-lg">{t(milestone.title)}</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-300 sm:text-[13px]">{t(milestone.text)}</p>
        <p className="mt-2 hidden text-[10px] text-slate-500 sm:block">{credit}</p>
      </div>

      {/* timeline: play · period band (ICS colours) with chapter marks · scrubber */}
      <div
        style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
        className="hud pointer-events-auto inset-x-0 mx-auto flex w-[min(52rem,94vw)] items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5"
      >
        <button
          type="button"
          onClick={() => {
            if (ma <= FUTURE_MA) setMa(MAX_MA)
            setPlaying((p) => !p)
          }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-300/50 bg-amber-300/10 text-base text-amber-100 shadow-[0_0_18px_rgba(252,211,77,0.25)] transition hover:bg-amber-300/20"
          aria-label={playing ? t('Pause') : t('Play')}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <div className="relative grow pt-5 pb-4">
          {/* period band */}
          <div className="absolute inset-x-0 top-[1.15rem] flex h-1.5 overflow-hidden rounded-full">
            {PERIODS.map((p) => (
              <span
                key={p.name}
                title={t(p.name)}
                style={{ width: `${(pos(p.to) - pos(p.from)) * 100}%`, background: p.color, opacity: p === period ? 1 : 0.45 }}
                className="h-full transition-opacity"
              />
            ))}
          </div>
          {/* period labels */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex font-[var(--font-mono)] text-[9px] tracking-wider uppercase">
            {PERIODS.map((p) => (
              <span
                key={p.name}
                style={{ width: `${(pos(p.to) - pos(p.from)) * 100}%`, color: p === period ? p.color : undefined }}
                className="truncate text-center text-slate-500"
              >
                {/* narrow periods (Neogene) keep their one-letter symbol */}
                <span className={pos(p.to) - pos(p.from) < 0.06 ? '' : 'sm:hidden'}>{p.short}</span>
                {pos(p.to) - pos(p.from) >= 0.06 && <span className="hidden sm:inline">{t(p.name)}</span>}
              </span>
            ))}
          </div>
          {/* chapter marks — click to jump */}
          {MILESTONES.map((m, i) => (
            <button
              key={m.ma}
              type="button"
              title={t(m.title)}
              aria-label={t(m.title)}
              onClick={() => jump(m.ma)}
              style={{ left: `${(pos(m.ma) * 100).toFixed(2)}%` }}
              className={`absolute top-0 h-3 w-3 -translate-x-1/2 rounded-full border transition ${
                i === mIndex
                  ? 'border-amber-200 bg-amber-300 shadow-[0_0_10px_#fcd34d]'
                  : m.ma === 0
                    ? 'border-cyan-200/80 bg-cyan-300/40'
                    : 'border-white/30 bg-white/10 hover:border-amber-200'
              }`}
            />
          ))}
          <input
            type="range"
            min={0}
            max={MAX_MA - FUTURE_MA}
            step={1}
            aria-label={t('Geological time')}
            // slider left = oldest (Pangaea), right = projected future → invert
            value={MAX_MA - ma}
            onChange={(e) => {
              setPlaying(false)
              setMa(MAX_MA - Number(e.target.value))
            }}
            className="drift-range absolute inset-x-0 top-[0.7rem] w-full"
          />
        </div>
      </div>
      {/* attribution on phones (desktop shows it in the story card) */}
      <p
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.6rem)' }}
        className="pointer-events-none absolute inset-x-0 px-4 text-center text-[9px] text-slate-500 sm:hidden"
      >
        {credit}
      </p>
    </div>
  )
}
