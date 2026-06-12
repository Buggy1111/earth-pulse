import Globe, { type GlobeInstance } from 'globe.gl'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { feature as topoFeature, mesh as topoMesh } from 'topojson-client'
import type { Topology, Objects } from 'topojson-specification'
import { geometryLabelPoint } from '../lib/labels'
import { APOLLO_SITES, subLunarPoint, type ApolloSite } from '../lib/moon'
import { PLANETS, planetPositions, sceneDistance, subPlanetPoint } from '../lib/planets'
import { auroraOvals } from '../lib/aurora'
import type { IssState } from '../lib/iss'
import { glowOpacity, glowScale, magColor, magRadius, type Quake } from '../lib/quakes'
import {
  globeAltitude,
  isIss,
  orbitTrack,
  propagateSats,
  type SatPos,
  type TrackedSat,
} from '../lib/satellites'
import { subsolarPoint } from '../lib/sun'
import { makeDayNightMaterial, sunlitClouds, sunlitTiles } from './dayNightMaterial'
import type { LayerState } from './Hud'
import { makeIssObject, makeNameSprite, makeSatelliteObject } from './spaceObjects'

interface Props {
  quakes: Quake[]
  /** Quakes that just appeared in the feed — rendered as bright flash rings. */
  flashes: Quake[]
  iss: IssState | null
  /** Parsed TLE sets; propagation runs inside this component, off the React path. */
  sats: TrackedSat[]
  /** Live Kp index for the aurora ovals (null until the first NOAA reading). */
  kp: number | null
  /** Which globe layers the user wants to see. */
  layers: LayerState
  /** NORAD ids whose orbits are drawn (managed by the parent via onSatClick). */
  selectedOrbitIds: string[]
  /** Browser geolocation result — marked on the globe and flown to. */
  userLoc: { lat: number; lng: number } | null
  /** Bumped on every locate click so we re-fly even to an unchanged position. */
  locVersion: number
  /** Eco/performance mode: 4K textures, 1× pixel ratio, 30 Hz propagation. */
  eco: boolean
  /** Camera restored from a shared link — overrides the default opening view. */
  initialPov: { lat: number; lng: number; altitude: number } | null
  /** Debounced camera reports for the share URL. */
  onPovChange: (pov: { lat: number; lng: number; altitude: number }) => void
  /** Satellite picked in the search box — fly the camera to it. */
  focusSat: { id: string; v: number } | null
  /** Quake picked in the HUD — fly the camera there. */
  flyTo: { lat: number; lng: number; v: number } | null
  /** Reference "now" for quake age/glow — the timeline slider rewinds it. */
  simNow: number
  /** Cinematic tour: the camera glides between live points of interest. */
  tour: boolean
  /** User grabbed the globe during the tour — parent should stop it. */
  onTourBroken: () => void
  /** Orbit the Moon instead of Earth (entered by clicking the Moon). */
  moonMode: boolean
  /** The Moon was clicked while orbiting Earth. */
  onMoonEnter: () => void
  /** An Apollo site marker was clicked (null = clicked elsewhere on the Moon). */
  onApolloPick: (site: ApolloSite | null) => void
  /** 🪐 Solar system mode: Sun + 8 planets at today's real positions. */
  solarMode: boolean
  /** Which planet the camera orbits in solar mode (null = Sun overview). */
  focusPlanet: string | null
  /** A planet (or the Sun = 'sun') was clicked in solar mode. */
  onPlanetPick: (id: string) => void
  followIss: boolean
  /** User grabbed the globe while following — parent should drop follow mode. */
  onFollowBroken: () => void
  /** Click on the ISS model toggles follow mode. */
  onIssClick: () => void
  /** Click on a satellite toggles its orbit in the parent's list. */
  onSatClick: (id: string, name: string) => void
  onQuakeClick: (quake: Quake) => void
  onReady: () => void
}

const SUN_REFRESH_MS = 60_000
const CLOUDS_ALTITUDE = 0.006
const CLOUDS_DEG_PER_FRAME = -0.002
const ARROW_LOOP_MS = 22_000

const ARROW_GEO = new THREE.ConeGeometry(0.8, 2.4, 8)
const ARROW_MAT = new THREE.MeshBasicMaterial({
  color: '#bdf0ff',
  transparent: true,
  opacity: 0.95,
})

/** One datum for the objects layer: a tracked satellite or the ISS itself. */
interface OrbitObject extends SatPos {
  kind: 'sat' | 'iss'
  sat?: TrackedSat
}

/** Third-party text ends up in HTML tooltips — escape it. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function tooltip(html: string): string {
  return `<div style="font-family:sans-serif;font-size:12px;background:rgba(7,9,15,.9);padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15)">${html}</div>`
}

/** Small ▲ texture for the volcano points cloud. */
let triangleTexture: THREE.CanvasTexture | null = null
function getTriangleTexture(): THREE.CanvasTexture {
  if (triangleTexture) return triangleTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.moveTo(16, 3)
  ctx.lineTo(29, 29)
  ctx.lineTo(3, 29)
  ctx.closePath()
  ctx.fill()
  triangleTexture = new THREE.CanvasTexture(canvas)
  return triangleTexture
}

/** Soft radial glow, tinted per quake by the sprite material color. */
let glowTexture: THREE.CanvasTexture | null = null
function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.22, 'rgba(255,255,255,0.65)')
  g.addColorStop(0.55, 'rgba(255,255,255,0.14)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  glowTexture = new THREE.CanvasTexture(canvas)
  return glowTexture
}

/** Two overlaid strokes per orbit: a wide soft halo + a bright animated core. */
interface TrailPath {
  points: [number, number, number][]
  kind: 'halo' | 'core'
}

/** One shown orbit: its path pair + the direction arrow riding the ring. */
interface Trail {
  paths: TrailPath[]
  arrow: THREE.Mesh
  vectors: THREE.Vector3[]
  phase: number
}

interface CountryLabel {
  name: string
  lat: number
  lng: number
}

/** One datum for the rings layer: steady ripples on strong quakes + bright flashes on new ones. */
interface RingDatum {
  lat: number
  lng: number
  mag: number
  flash: boolean
}

export function GlobeView({
  quakes,
  flashes,
  iss,
  sats,
  kp,
  layers,
  selectedOrbitIds,
  userLoc,
  locVersion,
  eco,
  focusSat,
  flyTo,
  simNow,
  tour,
  onTourBroken,
  moonMode,
  onMoonEnter,
  onApolloPick,
  solarMode,
  focusPlanet,
  onPlanetPick,
  initialPov,
  onPovChange,
  followIss,
  onFollowBroken,
  onIssClick,
  onSatClick,
  onQuakeClick,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const onFollowBrokenRef = useRef(onFollowBroken)
  const onIssClickRef = useRef(onIssClick)
  const onSatClickRef = useRef(onSatClick)
  const onReadyRef = useRef(onReady)
  const onPovChangeRef = useRef(onPovChange)
  const onTourBrokenRef = useRef(onTourBroken)
  const onMoonEnterRef = useRef(onMoonEnter)
  const onApolloPickRef = useRef(onApolloPick)
  const onPlanetPickRef = useRef(onPlanetPick)
  const followRef = useRef(followIss)
  const tourRef = useRef(tour)
  const moonModeRef = useRef(moonMode)
  const solarModeRef = useRef(solarMode)
  const layersRef = useRef(layers)
  const quakesRef = useRef(quakes)
  useEffect(() => {
    onFollowBrokenRef.current = onFollowBroken
    onIssClickRef.current = onIssClick
    onSatClickRef.current = onSatClick
    onReadyRef.current = onReady
    onPovChangeRef.current = onPovChange
    onTourBrokenRef.current = onTourBroken
    onMoonEnterRef.current = onMoonEnter
    onApolloPickRef.current = onApolloPick
    onPlanetPickRef.current = onPlanetPick
    followRef.current = followIss
    tourRef.current = tour
    moonModeRef.current = moonMode
    solarModeRef.current = solarMode
    layersRef.current = layers
    quakesRef.current = quakes
  }, [onFollowBroken, onIssClick, onSatClick, onReady, onPovChange, onTourBroken, onMoonEnter, onApolloPick, onPlanetPick, followIss, tour, moonMode, solarMode, layers, quakes])
  const initialPovRef = useRef(initialPov)

  // the globe slowly spins as an opening showcase — first user touch stops it for good
  const userInteractedRef = useRef(false)

  // live API telemetry for the ISS tooltip (visual position comes from SGP4)
  const issStateRef = useRef<IssState | null>(null)

  // shown orbits + the cloud mesh + country borders + live orbit datums,
  // shared between effects outside React state
  const trailsRef = useRef<Map<string, Trail>>(new Map())
  const cloudsRef = useRef<THREE.Mesh | null>(null)
  const bordersRef = useRef<THREE.LineSegments | null>(null)
  const orbitObjectsRef = useRef<Map<string, OrbitObject>>(new Map())
  const tileUpdateRef = useRef<() => void>(() => {})
  const labelsUpdateRef = useRef<() => void>(() => {})
  const countryLabelsRef = useRef<CountryLabel[]>([])
  const volcanoesRef = useRef<THREE.Points | null>(null)
  const moonMeshRef = useRef<THREE.Mesh | null>(null)
  const apolloMarkersRef = useRef<THREE.Mesh[]>([])
  /** Whatever the orbit controls should stay pinned to (Moon, Sun, a planet). */
  const pinTargetRef = useRef<THREE.Object3D | null>(null)
  const solarGroupRef = useRef<THREE.Group | null>(null)
  const planetMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const sunMeshRef = useRef<THREE.Mesh | null>(null)
  const updateSolarRef = useRef<() => void>(() => {})
  const ecoRef = useRef(eco)
  const globeMaterialRef = useRef<THREE.ShaderMaterial | null>(null)
  const textureResRef = useRef<'4k' | '8k'>(eco ? '4k' : '8k')

  // one-time globe setup
  useEffect(() => {
    if (!containerRef.current) return
    const fromLink = initialPovRef.current
    const globe = new Globe(containerRef.current)
      .backgroundImageUrl('night-sky.png')
      .atmosphereColor('#7dd3fc')
      .atmosphereAltitude(0.18)
      .pointOfView(fromLink ?? { lat: 25, lng: 15, altitude: 2.2 }, 0)

    // a shared link IS the view — don't auto-rotate away from it
    userInteractedRef.current = !!fromLink
    globe.controls().autoRotate = !fromLink
    globe.controls().autoRotateSpeed = 0.45
    const onDragStart = () => {
      userInteractedRef.current = true
      globe.controls().autoRotate = false
      if (followRef.current) onFollowBrokenRef.current()
      if (tourRef.current) onTourBrokenRef.current()
    }
    globe.controls().addEventListener('start', onDragStart)

    // one Sun for everything: the globe shader, the cloud layer, plus a real
    // Sun glow and Moon in the sky — refreshed from real ephemerides per minute
    const sunUniform = { value: new THREE.Vector3(1, 0, 0) }
    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: '#fff3c2',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    sunSprite.scale.set(160, 160, 1)
    globe.scene().add(sunSprite)
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(5, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#e8edf3' }),
    )
    new THREE.TextureLoader().load('moon-2k.jpg', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      const m = moonMesh.material as THREE.MeshBasicMaterial
      m.map = tex
      m.color.set('#ffffff')
      m.needsUpdate = true
    })
    moonMeshRef.current = moonMesh
    // Apollo landing sites pinned to the lunar surface (selenographic coords)
    const markerGeo = new THREE.SphereGeometry(0.22, 8, 8)
    const markerMat = new THREE.MeshBasicMaterial({ color: '#4ade80' })
    apolloMarkersRef.current = APOLLO_SITES.map((site) => {
      const marker = new THREE.Mesh(markerGeo, markerMat)
      const phi = (90 - site.lat) * (Math.PI / 180)
      const theta = (site.lng + 90) * (Math.PI / 180)
      marker.position.set(
        5.05 * Math.sin(phi) * Math.cos(theta),
        5.05 * Math.cos(phi),
        -5.05 * Math.sin(phi) * Math.sin(theta),
      )
      marker.userData.site = site
      moonMesh.add(marker)
      return marker
    })

    // click handling for the Moon itself + Apollo markers (not globe.gl layers)
    const raycaster = new THREE.Raycaster()
    let downX = 0
    let downY = 0
    const onPtrDown = (ev: PointerEvent) => {
      downX = ev.clientX
      downY = ev.clientY
    }
    const onCanvasClick = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY) > 6) return // drag
      const rect = globe.renderer().domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, globe.camera() as THREE.PerspectiveCamera)
      if (solarModeRef.current) {
        const bodies = [...planetMeshesRef.current.values()]
        if (sunMeshRef.current) bodies.push(sunMeshRef.current)
        const hit = raycaster.intersectObjects(bodies, false)[0]
        if (hit) onPlanetPickRef.current(hit.object.userData.planetId as string)
      } else if (moonModeRef.current) {
        const hit = raycaster.intersectObjects(apolloMarkersRef.current, false)[0]
        onApolloPickRef.current((hit?.object.userData.site as ApolloSite) ?? null)
      } else {
        const hit = raycaster.intersectObject(moonMesh, true)[0]
        if (hit) onMoonEnterRef.current()
      }
    }
    globe.renderer().domElement.addEventListener('pointerdown', onPtrDown)
    globe.renderer().domElement.addEventListener('click', onCanvasClick)

    // globe.gl pins controls.target to (0,0,0) in its own 'change' listener —
    // ours registers later, so per event we get the last word and re-pin to
    // whatever body we're orbiting (Moon, Sun, a planet)
    const keepPinnedTarget = () => {
      const pin = pinTargetRef.current
      if (pin) globe.controls().target.copy(pin.position)
    }
    globe.controls().addEventListener('change', keepPinnedTarget)
    const moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: '#dfe7f2',
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    moonGlow.scale.set(22, 22, 1)
    moonMesh.add(moonGlow)
    globe.scene().add(moonMesh)

    const applySun = () => {
      const now = new Date()
      const sun = subsolarPoint(now)
      const { x, y, z } = globe.getCoords(sun.lat, sun.lng, 0)
      sunUniform.value.set(x, y, z).normalize()
      sunSprite.position.copy(sunUniform.value).multiplyScalar(900)
      const moon = subLunarPoint(now)
      const mc = globe.getCoords(moon.lat, moon.lng, 0)
      moonMesh.position.set(mc.x, mc.y, mc.z).normalize().multiplyScalar(480)
      // brighter glow around fuller moon
      ;(moonGlow.material as THREE.SpriteMaterial).opacity = 0.25 + 0.5 * moon.illumination
    }
    applySun()
    const sunTimer = setInterval(applySun, SUN_REFRESH_MS)

    // real day & night: day texture blended into city lights along the live
    // terminator (textures © Solar System Scope, CC BY 4.0). Eco mode starts
    // straight on 4K so weak GPUs never even download the 8K files.
    globe.renderer().setPixelRatio(ecoRef.current ? 1 : Math.min(window.devicePixelRatio, 2))
    const res = textureResRef.current
    const loader = new THREE.TextureLoader()
    void Promise.all([
      loader.loadAsync(`earth-day-${res}.jpg`),
      loader.loadAsync(`earth-night-${res}.jpg`),
    ]).then(([day, night]) => {
      if (!globeRef.current) return // unmounted while loading
      const material = makeDayNightMaterial(day, night, sunUniform)
      globeMaterialRef.current = material
      globe.globeMaterial(material)
      onReadyRef.current()
    })

    // map-style detail: below TILES_ON altitude the built-in tile engine
    // streams Esri World Imagery (LOD up to street level); zooming back out
    // returns to the day/night shader. Hysteresis avoids flicker.
    const TILES_ON = 0.25
    const TILES_OFF = 0.38
    const tileUrl = (x: number, y: number, l: number) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`
    let tilesOn = false
    let tilePatchTimer: ReturnType<typeof setInterval> | undefined
    const updateTileEngine = () => {
      const alt = globe.pointOfView().altitude ?? 10
      if (layersRef.current.detail && alt < TILES_ON && !tilesOn) {
        tilesOn = true
        globe.globeTileEngineUrl(tileUrl)
        tilePatchTimer = setInterval(patchTileMaterials, 1_200)
      } else if ((!layersRef.current.detail || alt > TILES_OFF) && tilesOn) {
        tilesOn = false
        globe.globeTileEngineUrl(null as unknown as Parameters<GlobeInstance['globeTileEngineUrl']>[0])
        clearInterval(tilePatchTimer)
      }
    }
    globe.globeTileEngineMaxLevel(17)
    globe.controls().addEventListener('change', updateTileEngine)
    tileUpdateRef.current = updateTileEngine

    // report the camera so the share URL follows the user around: instantly
    // when an interaction ends, debounced otherwise (auto-rotate fires
    // 'change' every frame and would starve a plain debounce)
    let povTimer: ReturnType<typeof setTimeout> | undefined
    const reportPov = () => {
      // lunar/solar cameras don't map to a shareable Earth view
      if (moonModeRef.current || solarModeRef.current) return
      onPovChangeRef.current(globe.pointOfView())
    }
    const onCamChange = () => {
      clearTimeout(povTimer)
      povTimer = setTimeout(reportPov, 600)
    }
    globe.controls().addEventListener('change', onCamChange)
    globe.controls().addEventListener('end', reportPov)

    // slowly drifting cloud layer just above the surface, fading out at night
    let cloudsRaf = 0
    loader.load('clouds.webp', (texture) => {
      if (!globeRef.current) return
      const cloudsMaterial = new THREE.MeshPhongMaterial({
        map: texture,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      })
      sunlitClouds(cloudsMaterial, sunUniform)
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(globe.getGlobeRadius() * (1 + CLOUDS_ALTITUDE), 64, 64),
        cloudsMaterial,
      )
      clouds.visible = layersRef.current.clouds
      // explicit compositing order: clouds above the globe, below glow sprites —
      // distance-sorted transparency ties can otherwise flip frame to frame
      clouds.renderOrder = 2
      globe.scene().add(clouds)
      cloudsRef.current = clouds
      const rotate = () => {
        clouds.rotation.y += (CLOUDS_DEG_PER_FRAME * Math.PI) / 180
        cloudsRaf = requestAnimationFrame(rotate)
      }
      cloudsRaf = requestAnimationFrame(rotate)
    })

    // country borders: Natural Earth 110m as one merged line-segment mesh,
    // draped just above the surface; the same file feeds the name labels
    void fetch('geo/countries-110m.json')
      .then((r) => r.json())
      .then((topo: Topology<Objects>) => {
        if (!globeRef.current) return
        const borders = topoMesh(topo, topo.objects.countries)
        const lines =
          borders.type === 'MultiLineString' ? borders.coordinates : [borders.coordinates]
        const positions: number[] = []
        for (const line of lines) {
          for (let i = 0; i < line.length - 1; i++) {
            for (const [lng, lat] of [line[i], line[i + 1]]) {
              const { x, y, z } = globe.getCoords(lat as number, lng as number, 0.004)
              positions.push(x, y, z)
            }
          }
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        const segments = new THREE.LineSegments(
          geometry,
          new THREE.LineBasicMaterial({ color: '#9fb3c8', transparent: true, opacity: 0.38 }),
        )
        segments.visible = layersRef.current.borders
        segments.renderOrder = 1
        globe.scene().add(segments)
        bordersRef.current = segments

        // country names, visible once you zoom in a bit
        const fc = topoFeature(topo, topo.objects.countries)
        const features = 'features' in fc ? fc.features : [fc]
        countryLabelsRef.current = features.flatMap((f) => {
          const name = (f.properties as { name?: string } | null)?.name
          if (!name || !f.geometry) return []
          const g = f.geometry
          if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return []
          const p = geometryLabelPoint(g as Parameters<typeof geometryLabelPoint>[0])
          return [{ name, lat: p.lat, lng: p.lng }]
        })
        globe
          .labelLat((d) => (d as CountryLabel).lat)
          .labelLng((d) => (d as CountryLabel).lng)
          .labelText((d) => (d as CountryLabel).name)
          .labelSize(0.6)
          .labelDotRadius(0)
          .labelAltitude(0.008)
          .labelColor(() => 'rgba(226, 232, 240, 0.72)')
          .labelResolution(2)
        updateLabels()
      })
      .catch(() => {
        // no borders file — the globe just stays border-less
      })

    // labels fade in below this altitude (and out above, with hysteresis)
    const LABELS_ON = 1.4
    const LABELS_OFF = 1.7
    let labelsShown = false
    const updateLabels = () => {
      const alt = globe.pointOfView().altitude ?? 10
      const want = layersRef.current.labels && countryLabelsRef.current.length > 0 &&
        (alt < (labelsShown ? LABELS_OFF : LABELS_ON))
      if (want !== labelsShown) {
        labelsShown = want
        globe.labelsData(want ? countryLabelsRef.current : [])
      }
    }
    globe.controls().addEventListener('change', updateLabels)
    labelsUpdateRef.current = updateLabels

    // night-side dimming for streamed Esri tiles: their Lambert materials are
    // created lazily inside the tile engine, so patch new ones as they appear
    const tilesRootRef = { current: null as THREE.Object3D | null }
    const patchTileMaterials = () => {
      if (!tilesRootRef.current) {
        globe.scene().traverse((o) => {
          if ((o as { __globeObjType?: string }).__globeObjType === 'globe')
            tilesRootRef.current = o
        })
      }
      tilesRootRef.current?.traverse((o) => {
        const mesh = o as THREE.Mesh
        const m = mesh.material as THREE.MeshLambertMaterial | undefined
        if (mesh.isMesh && m?.type === 'MeshLambertMaterial' && !m.userData.sunPatched) {
          m.userData.sunPatched = true
          sunlitTiles(m, sunUniform)
        }
      })
    }

    // 1215 Holocene volcanoes (Smithsonian GVP snapshot) as one Points cloud
    void fetch('geo/volcanoes.json')
      .then((r) => r.json())
      .then((volcanoes: { n: string; la: number; lo: number }[]) => {
        if (!globeRef.current) return
        const positions: number[] = []
        for (const v of volcanoes) {
          const { x, y, z } = globe.getCoords(v.la, v.lo, 0.005)
          positions.push(x, y, z)
        }
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
        const points = new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            map: getTriangleTexture(),
            color: '#ff7a50',
            size: 2.4,
            transparent: true,
            depthWrite: false,
            alphaTest: 0.15,
          }),
        )
        points.visible = layersRef.current.volcanoes
        points.renderOrder = 1
        globe.scene().add(points)
        volcanoesRef.current = points
      })
      .catch(() => {
        // no volcano file — layer simply unavailable
      })

    const onResize = () => {
      globe.width(window.innerWidth).height(window.innerHeight)
    }
    onResize()
    window.addEventListener('resize', onResize)

    globeRef.current = globe
    // e2e hook: headless tests steer the camera through this handle
    ;(window as unknown as Record<string, unknown>).__earthPulseGlobe = globe
    return () => {
      clearInterval(sunTimer)
      cancelAnimationFrame(cloudsRaf)
      const clouds = cloudsRef.current
      if (clouds) {
        globe.scene().remove(clouds)
        clouds.geometry.dispose()
        ;(clouds.material as THREE.MeshPhongMaterial).map?.dispose()
        ;(clouds.material as THREE.MeshPhongMaterial).dispose()
        cloudsRef.current = null
      }
      const borders = bordersRef.current
      if (borders) {
        globe.scene().remove(borders)
        borders.geometry.dispose()
        ;(borders.material as THREE.LineBasicMaterial).dispose()
        bordersRef.current = null
      }
      const volcanoes = volcanoesRef.current
      if (volcanoes) {
        globe.scene().remove(volcanoes)
        volcanoes.geometry.dispose()
        ;(volcanoes.material as THREE.PointsMaterial).dispose()
        volcanoesRef.current = null
      }
      globe.renderer().domElement.removeEventListener('pointerdown', onPtrDown)
      globe.renderer().domElement.removeEventListener('click', onCanvasClick)
      globe.controls().removeEventListener('change', keepPinnedTarget)
      globe.scene().remove(sunSprite)
      sunSprite.material.dispose()
      globe.scene().remove(moonMesh)
      moonMesh.geometry.dispose()
      ;(moonMesh.material as THREE.MeshBasicMaterial).dispose()
      moonGlow.material.dispose()
      markerGeo.dispose()
      markerMat.dispose()
      moonMeshRef.current = null
      apolloMarkersRef.current = []
      globe.controls().removeEventListener('start', onDragStart)
      globe.controls().removeEventListener('change', updateTileEngine)
      globe.controls().removeEventListener('change', updateLabels)
      globe.controls().removeEventListener('change', onCamChange)
      globe.controls().removeEventListener('end', reportPov)
      clearTimeout(povTimer)
      clearInterval(tilePatchTimer)
      window.removeEventListener('resize', onResize)
      globe._destructor()
      globeRef.current = null
    }
  }, [])

  // cloud + border layer visibility (meshes live outside React)
  useEffect(() => {
    if (cloudsRef.current) cloudsRef.current.visible = layers.clouds
  }, [layers.clouds])
  useEffect(() => {
    if (bordersRef.current) bordersRef.current.visible = layers.borders
  }, [layers.borders])
  useEffect(() => {
    if (volcanoesRef.current) volcanoesRef.current.visible = layers.volcanoes
  }, [layers.volcanoes])
  useEffect(() => {
    tileUpdateRef.current()
  }, [layers.detail])
  useEffect(() => {
    labelsUpdateRef.current()
  }, [layers.labels])

  // eco/performance mode: pixel ratio + texture resolution swap on the fly
  useEffect(() => {
    ecoRef.current = eco
    const globe = globeRef.current
    if (!globe) return
    globe.renderer().setPixelRatio(eco ? 1 : Math.min(window.devicePixelRatio, 2))
    const wanted: '4k' | '8k' = eco ? '4k' : '8k'
    const material = globeMaterialRef.current
    if (!material || textureResRef.current === wanted) return
    textureResRef.current = wanted
    const loader = new THREE.TextureLoader()
    void Promise.all([
      loader.loadAsync(`earth-day-${wanted}.jpg`),
      loader.loadAsync(`earth-night-${wanted}.jpg`),
    ]).then(([day, night]) => {
      if (textureResRef.current !== wanted || !globeRef.current) return
      day.colorSpace = THREE.SRGBColorSpace
      night.colorSpace = THREE.SRGBColorSpace
      for (const [key, tex] of [
        ['dayTexture', day],
        ['nightTexture', night],
      ] as const) {
        const old = material.uniforms[key].value as THREE.Texture
        material.uniforms[key].value = tex
        old.dispose()
      }
    })
  }, [eco])

  // aurora ovals around the geomagnetic poles, scaled by the live Kp index
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || kp === null) return
    globe
      .polygonsData(layers.aurora ? auroraOvals(kp) : [])
      .polygonCapColor((d) => `rgba(74, 222, 128, ${(d as { opacity: number }).opacity})`)
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => 'rgba(0,0,0,0)')
      .polygonAltitude(0.018)
      .polygonGeoJsonGeometry(
        ((d: { rings: [number, number][][] }) => ({
          type: 'Polygon' as const,
          coordinates: d.rings,
        })) as unknown as Parameters<GlobeInstance['polygonGeoJsonGeometry']>[0],
      )
  }, [kp, layers.aurora])

  // earthquakes: additive glow sprites (warm ramp, fading with event age)
  // + ripple rings (steady on M4+, bright flash on brand-new)
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    const now = simNow
    globe
      .customLayerData(layers.quakes ? quakes : [])
      .customThreeObject((d) => {
        const q = d as Quake
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: getGlowTexture(),
            color: magColor(q.mag),
            transparent: true,
            opacity: glowOpacity(q.time, now),
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        )
        const scale = glowScale(q.mag)
        sprite.scale.set(scale, scale, 1)
        sprite.renderOrder = 3
        return sprite
      })
      .customThreeObjectUpdate((obj, d) => {
        const q = d as Quake
        Object.assign(obj.position, globe.getCoords(q.lat, q.lng, 0.012))
        ;((obj as THREE.Sprite).material as THREE.SpriteMaterial).opacity = glowOpacity(
          q.time,
          now,
        )
      })
      .customLayerLabel((d) => {
        const q = d as Quake
        return tooltip(`<b>M ${q.mag.toFixed(1)}</b> · ${escapeHtml(q.place)}`)
      })
      .onCustomLayerClick((d) => onQuakeClick(d as Quake))

    const rings: RingDatum[] = layers.quakes
      ? [
          ...quakes
            .filter((q) => q.mag >= 4)
            .map((q) => ({ lat: q.lat, lng: q.lng, mag: q.mag, flash: false })),
          ...flashes.map((q) => ({ lat: q.lat, lng: q.lng, mag: q.mag, flash: true })),
        ]
      : []
    globe
      .ringsData(rings)
      .ringLat((d) => (d as RingDatum).lat)
      .ringLng((d) => (d as RingDatum).lng)
      .ringColor((d: object) => {
        const r = d as RingDatum
        return r.flash ? () => '#f8fafc' : () => magColor(r.mag)
      })
      .ringMaxRadius((d) => {
        const r = d as RingDatum
        return r.flash ? Math.max(3, magRadius(r.mag) * 1.6) : magRadius(r.mag)
      })
      .ringPropagationSpeed((d) => ((d as RingDatum).flash ? 4 : 1.4))
      .ringRepeatPeriod((d) => ((d as RingDatum).flash ? 600 : 1800))
  }, [quakes, flashes, onQuakeClick, layers.quakes, simNow])

  // orbit engine: SGP4-propagate everything (ISS included) EVERY FRAME and
  // move the meshes directly — perfectly fluid motion, no React, no globe
  // data digest, just position writes on stable Object3Ds
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || sats.length === 0) return

    const trails = trailsRef.current
    const satById = new Map(sats.map((s) => [s.id, s]))
    const byId = new Map<string, OrbitObject>()
    const objects: OrbitObject[] = []
    for (const p of propagateSats(sats, new Date())) {
      const sat = satById.get(p.id)
      if (!sat) continue
      const o: OrbitObject = {
        kind: isIss(p.name) ? 'iss' : 'sat',
        id: p.id,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        altKm: p.altKm,
        sat,
      }
      byId.set(p.id, o)
      objects.push(o)
    }
    orbitObjectsRef.current = byId

    // three-globe hangs each datum's Object3D off the datum itself
    // (key __threeObjObject for the objects layer; older versions __threeObj)
    type WithMesh = { __threeObjObject?: THREE.Object3D; __threeObj?: THREE.Object3D }
    let raf = 0
    let frameNo = 0
    const dir = new THREE.Vector3()
    const frame = () => {
      // eco mode: propagate at half the frame rate — still fluid, half the CPU
      if (ecoRef.current && ++frameNo % 2 === 1) {
        raf = requestAnimationFrame(frame)
        return
      }
      const now = new Date()
      const show = layersRef.current
      for (const p of propagateSats(sats, now)) {
        const o = byId.get(p.id)
        if (!o) continue
        o.lat = p.lat
        o.lng = p.lng
        o.altKm = p.altKm
        const mesh = (o as WithMesh).__threeObjObject ?? (o as WithMesh).__threeObj
        if (mesh) {
          mesh.visible = o.kind === 'iss' ? show.iss : show.sats
          Object.assign(mesh.position, globe.getCoords(p.lat, p.lng, globeAltitude(p.altKm)))
        }
      }
      // bodies drift — keep the orbit pivot glued to whatever we're orbiting
      if (pinTargetRef.current) {
        globe.controls().target.copy(pinTargetRef.current.position)
      }
      // arrows ride their orbit rings in the direction of flight
      const cycle = now.getTime() / ARROW_LOOP_MS
      for (const t of trails.values()) {
        const n = t.vectors.length
        if (n < 2) continue
        const u = ((cycle + t.phase) % 1) * (n - 1)
        const i = Math.floor(u)
        const a = t.vectors[i]
        const b = t.vectors[Math.min(i + 1, n - 1)]
        t.arrow.position.lerpVectors(a, b, u - i)
        dir.subVectors(b, a).normalize()
        t.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      }
      raf = requestAnimationFrame(frame)
    }

    globe
      .objectLat((d) => (d as OrbitObject).lat)
      .objectLng((d) => (d as OrbitObject).lng)
      .objectAltitude((d) => globeAltitude((d as OrbitObject).altKm))
      .objectThreeObject((d) =>
        (d as OrbitObject).kind === 'iss' ? makeIssObject() : makeSatelliteObject(),
      )
      .objectLabel((d) => {
        const o = d as OrbitObject
        if (o.kind === 'iss') {
          const v = issStateRef.current?.velocityKmh
          const speed = v ? ` · ${Math.round(v).toLocaleString('en-US')} km/h` : ''
          return tooltip(`🛰 <b>ISS</b> · ${Math.round(o.altKm)} km${speed} · click to follow`)
        }
        return tooltip(`🛰 <b>${escapeHtml(o.name)}</b> · ${Math.round(o.altKm)} km · click for orbit`)
      })
      .onObjectClick((d) => {
        const o = d as OrbitObject
        if (o.kind === 'iss') onIssClickRef.current()
        else onSatClickRef.current(o.id, o.name)
      })

    // sci-fi neon trails: wide soft halo underneath, bright energy pulse on top
    globe
      .pathPoints((d) => (d as TrailPath).points)
      .pathPointLat((p) => (p as number[])[0])
      .pathPointLng((p) => (p as number[])[1])
      .pathPointAlt((p) => (p as number[])[2])
      .pathColor((d: object) =>
        (d as TrailPath).kind === 'halo'
          ? ['rgba(56, 189, 248, 0.05)', 'rgba(56, 189, 248, 0.4)', 'rgba(56, 189, 248, 0.05)']
          : ['rgba(240, 253, 255, 0.95)', 'rgba(125, 211, 252, 0.9)', 'rgba(240, 253, 255, 0.95)'],
      )
      .pathStroke((d) => ((d as TrailPath).kind === 'halo' ? 5 : 1.3))
      .pathDashLength((d) => ((d as TrailPath).kind === 'halo' ? 1 : 0.06))
      .pathDashGap((d) => ((d as TrailPath).kind === 'halo' ? 0 : 0.025))
      .pathDashAnimateTime((d) => ((d as TrailPath).kind === 'halo' ? 0 : 4_000))
      .pathTransitionDuration(600)

    globe.objectsData(objects)
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      for (const t of trails.values()) globe.scene().remove(t.arrow)
      trails.clear()
      globe.pathsData([])
    }
  }, [sats])

  // sync shown orbits with the user's list (settings panel or clicks)
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || sats.length === 0) return
    const trails = trailsRef.current
    const want = new Set(selectedOrbitIds)

    for (const id of [...trails.keys()]) {
      if (!want.has(id)) {
        const t = trails.get(id)!
        globe.scene().remove(t.arrow)
        trails.delete(id)
      }
    }
    for (const id of want) {
      if (trails.has(id)) continue
      const sat = sats.find((s) => s.id === id)
      if (!sat) continue
      const track = orbitTrack(sat, new Date()).map(
        (p) => [p.lat, p.lng, globeAltitude(p.altKm)] as [number, number, number],
      )
      const vectors = track.map((p) => {
        const { x, y, z } = globe.getCoords(p[0], p[1], p[2])
        return new THREE.Vector3(x, y, z)
      })
      const arrow = new THREE.Mesh(ARROW_GEO, ARROW_MAT)
      globe.scene().add(arrow)
      trails.set(id, {
        paths: [
          { points: track, kind: 'halo' },
          { points: track, kind: 'core' },
        ],
        arrow,
        vectors,
        phase: trails.size * 0.37, // spread arrows so several orbits don't sync up
      })
    }
    globe.pathsData([...trails.values()].flatMap((t) => t.paths))
  }, [selectedOrbitIds, sats])

  // user's own location: pulsing pin + camera flight on every locate click
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe
      .htmlElementsData(userLoc ? [userLoc] : [])
      .htmlLat((d) => (d as { lat: number }).lat)
      .htmlLng((d) => (d as { lng: number }).lng)
      .htmlAltitude(0.012)
      .htmlElement(() => {
        const el = document.createElement('div')
        el.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;transform:translateY(-4px)">' +
          '<div style="font-size:20px;filter:drop-shadow(0 0 6px rgba(56,189,248,.9))">📍</div>' +
          '<div style="font:600 10px sans-serif;color:#bae6fd;text-shadow:0 0 6px #000">you are here</div></div>'
        return el
      })
    if (userLoc) {
      globe.pointOfView({ lat: userLoc.lat, lng: userLoc.lng, altitude: 0.9 }, 1_600)
      globe.controls().autoRotate = false
      userInteractedRef.current = true
    }
  }, [userLoc, locVersion])

  // 🎬 cinematic tour: glide between live points of interest every 8 s
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !tour) return
    globe.controls().autoRotate = false
    userInteractedRef.current = true
    let step = 0
    const next = () => {
      const stops: { lat: number; lng: number; altitude: number }[] = []
      const qs = quakesRef.current
      if (qs.length > 0) {
        const strongest = [...qs].sort((a, b) => b.mag - a.mag)[0]
        stops.push({ lat: strongest.lat, lng: strongest.lng, altitude: 0.8 })
      }
      const orbitObjs = [...orbitObjectsRef.current.values()]
      const issObj = orbitObjs.find((o) => o.kind === 'iss')
      if (issObj) stops.push({ lat: issObj.lat, lng: issObj.lng, altitude: 1.0 })
      stops.push({ lat: 78, lng: -70, altitude: 1.5 }) // northern aurora oval
      const sun = subsolarPoint(new Date())
      stops.push({ lat: 15, lng: ((sun.lng + 95 + 540) % 360) - 180, altitude: 1.3 }) // dusk line
      const satsOnly = orbitObjs.filter((o) => o.kind === 'sat')
      if (satsOnly.length > 0) {
        const pick = satsOnly[(step * 37) % satsOnly.length]
        stops.push({ lat: pick.lat, lng: pick.lng, altitude: 0.9 })
      }
      if (qs.length > 0) stops.push({ lat: qs[0].lat, lng: qs[0].lng, altitude: 0.9 }) // latest quake
      const target = stops[step % stops.length]
      step++
      globe.pointOfView(target, 4_000)
    }
    next()
    const id = setInterval(next, 8_000)
    return () => clearInterval(id)
  }, [tour])

  // 🪐 Solar System mode: Sun + 7 planets at today's real geocentric
  // positions, distances compressed (sceneDistance) so Neptune fits the
  // camera. Built lazily on first entry; textures stream in then.
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !solarMode) return

    if (!solarGroupRef.current) {
      const group = new THREE.Group()
      const loader = new THREE.TextureLoader()
      const loadTex = (mesh: THREE.Mesh, url: string) =>
        loader.load(url, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          const m = mesh.material as THREE.MeshBasicMaterial
          m.map = tex
          m.color.set('#ffffff')
          m.needsUpdate = true
        })

      // the Sun: textured ball inside the existing glow sprite
      const sun = new THREE.Mesh(
        new THREE.SphereGeometry(48, 32, 32),
        new THREE.MeshBasicMaterial({ color: '#ffd27a' }),
      )
      sun.userData.planetId = 'sun'
      loadTex(sun, 'planets/sun.jpg')
      group.add(sun)
      sunMeshRef.current = sun

      for (const p of PLANETS) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(p.displayRadius, 24, 24),
          new THREE.MeshBasicMaterial({ color: '#9aa3ae' }),
        )
        mesh.userData.planetId = p.id
        loadTex(mesh, p.texture)
        mesh.add(makeNameSprite(p.name, p.displayRadius))
        if (p.id === 'saturn') {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(p.displayRadius * 1.3, p.displayRadius * 2.2, 48),
            new THREE.MeshBasicMaterial({
              color: '#d8c9a3',
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.8,
            }),
          )
          loader.load('planets/saturn_ring.png', (tex) => {
            const m = ring.material as THREE.MeshBasicMaterial
            m.map = tex
            m.color.set('#ffffff')
            m.needsUpdate = true
          })
          ring.rotation.x = Math.PI / 2 - 0.46 // Saturn's 26.7° tilt
          mesh.add(ring)
        }
        group.add(mesh)
        planetMeshesRef.current.set(p.id, mesh)
      }

      // orbit guide rings, rebuilt on every position update
      const orbitLines = new THREE.Group()
      group.add(orbitLines)

      const updateSolar = () => {
        const now = new Date()
        const positions = planetPositions(now)
        // sun sits where applySun already puts the glow (900 units ≈ 1 AU)
        const sunSub = subsolarPoint(now)
        const sc = globe.getCoords(sunSub.lat, sunSub.lng, 0)
        const sunPos = new THREE.Vector3(sc.x, sc.y, sc.z).normalize().multiplyScalar(900)
        sun.position.copy(sunPos)
        // ecliptic pole in scene coordinates (RA 270°, Dec +66.56°)
        const polePt = subPlanetPoint({ raDeg: 270, decDeg: 66.56 }, now)
        const pc = globe.getCoords(polePt.lat, polePt.lng, 0)
        const pole = new THREE.Vector3(pc.x, pc.y, pc.z).normalize()

        orbitLines.clear()
        for (const pos of positions) {
          const mesh = planetMeshesRef.current.get(pos.id)
          if (!mesh) continue
          const pt = subPlanetPoint(pos, now)
          const c = globe.getCoords(pt.lat, pt.lng, 0)
          mesh.position
            .set(c.x, c.y, c.z)
            .normalize()
            .multiplyScalar(sceneDistance(pos.distEarthAu))
          // guide ring: circle around the Sun through the planet, in the ecliptic
          const radius = mesh.position.clone().sub(sunPos).length()
          const u = mesh.position.clone().sub(sunPos).normalize()
          const v = new THREE.Vector3().crossVectors(pole, u).normalize()
          const pts: THREE.Vector3[] = []
          for (let i = 0; i <= 128; i++) {
            const a = (i / 128) * Math.PI * 2
            pts.push(
              sunPos
                .clone()
                .addScaledVector(u, Math.cos(a) * radius)
                .addScaledVector(v, Math.sin(a) * radius),
            )
          }
          orbitLines.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(pts),
              new THREE.LineBasicMaterial({ color: '#64748b', transparent: true, opacity: 0.25 }),
            ),
          )
        }
      }
      updateSolarRef.current = updateSolar
      globe.scene().add(group)
      solarGroupRef.current = group
    }

    const group = solarGroupRef.current
    group.visible = true
    updateSolarRef.current()
    const timer = setInterval(updateSolarRef.current, 60_000)

    // widen the camera envelope for the outer system
    const cam = globe.camera() as THREE.PerspectiveCamera
    const controls = globe.controls()
    const prevFar = cam.far
    const prevMax = controls.maxDistance
    cam.far = 60_000
    cam.updateProjectionMatrix()
    controls.maxDistance = 25_000
    globe.controls().autoRotate = false
    userInteractedRef.current = true

    return () => {
      clearInterval(timer)
      group.visible = false
      cam.far = prevFar
      cam.updateProjectionMatrix()
      controls.maxDistance = prevMax
      pinTargetRef.current = null
      controls.target.set(0, 0, 0)
      controls.update()
      globe.pointOfView({ lat: 25, lng: 15, altitude: 2.2 }, 0)
    }
  }, [solarMode])

  // camera focus within solar mode: Sun overview or a chosen planet
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !solarMode) return
    const controls = globe.controls()
    const cam = globe.camera() as THREE.PerspectiveCamera
    const prevMin = controls.minDistance
    const focusMesh =
      (focusPlanet && focusPlanet !== 'sun' ? planetMeshesRef.current.get(focusPlanet) : null) ??
      sunMeshRef.current
    if (!focusMesh) return
    const radius =
      focusPlanet && focusPlanet !== 'sun'
        ? (PLANETS.find((p) => p.id === focusPlanet)?.displayRadius ?? 20)
        : 48
    pinTargetRef.current = focusMesh
    controls.minDistance = radius * 1.6
    controls.target.copy(focusMesh.position)
    if (focusPlanet) {
      // close-up of the chosen body
      const dir = cam.position.clone().sub(focusMesh.position).normalize()
      cam.position.copy(focusMesh.position).addScaledVector(dir, radius * 4.5)
    } else {
      // overview: above the ecliptic, the whole system in frame
      cam.position
        .copy(focusMesh.position)
        .add(new THREE.Vector3(0, 5_200, 7_800))
    }
    controls.update()
    return () => {
      controls.minDistance = prevMin
    }
  }, [solarMode, focusPlanet])

  // 🌙 Moon mode: re-target the orbit controls from Earth to the Moon —
  // you orbit the Moon exactly like Earth, with Earth hanging in its sky
  useEffect(() => {
    const globe = globeRef.current
    const moon = moonMeshRef.current
    if (!globe || !moon) return
    const controls = globe.controls()
    if (moonMode) {
      const prevMin = controls.minDistance
      globe.controls().autoRotate = false
      userInteractedRef.current = true
      controls.minDistance = 7 // moon radius is 5
      // camera between Earth and Moon, slightly offset, looking at the Moon
      const dir = moon.position.clone().normalize()
      const cam = globe.camera() as THREE.PerspectiveCamera
      cam.position.copy(moon.position).addScaledVector(dir, -22).add(new THREE.Vector3(0, 6, 0))
      pinTargetRef.current = moon
      controls.target.copy(moon.position)
      controls.update()
      return () => {
        pinTargetRef.current = null
        controls.minDistance = prevMin
        controls.target.set(0, 0, 0)
        controls.update()
        globe.pointOfView({ lat: 25, lng: 15, altitude: 2.2 }, 0)
      }
    }
  }, [moonMode])

  // search pick: fly the camera to the chosen satellite
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !focusSat) return
    const o = orbitObjectsRef.current.get(focusSat.id)
    if (!o) return
    globe.controls().autoRotate = false
    userInteractedRef.current = true
    globe.pointOfView(
      { lat: o.lat, lng: o.lng, altitude: Math.max(0.7, globeAltitude(o.altKm) + 0.35) },
      1_400,
    )
  }, [focusSat])

  // HUD quake click: fly the camera to the epicenter
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || !flyTo) return
    globe.controls().autoRotate = false
    userInteractedRef.current = true
    globe.pointOfView({ lat: flyTo.lat, lng: flyTo.lng, altitude: 1.0 }, 1_400)
  }, [flyTo])

  // live API telemetry — the tooltip and follow camera read it
  useEffect(() => {
    issStateRef.current = iss
  }, [iss])

  // follow ISS: chase camera on every position update, pause auto-rotate meanwhile
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe.controls().autoRotate = !followIss && !userInteractedRef.current
    if (followIss && iss) {
      const altitude = Math.min(globe.pointOfView().altitude ?? 2.2, 1.6)
      globe.pointOfView({ lat: iss.lat, lng: iss.lng, altitude }, 2_700)
    }
  }, [followIss, iss])

  return <div ref={containerRef} className="fixed inset-0" />
}
