import Globe, { type GlobeInstance } from 'globe.gl'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { auroraOvals } from '../lib/aurora'
import type { IssState } from '../lib/iss'
import { magColor, magRadius, type Quake } from '../lib/quakes'
import {
  globeAltitude,
  orbitTrack,
  propagateSats,
  type SatPos,
  type TrackedSat,
} from '../lib/satellites'
import { subsolarPoint } from '../lib/sun'
import { makeDayNightMaterial, sunlitClouds } from './dayNightMaterial'
import { makeIssObject, makeSatelliteObject } from './spaceObjects'

interface Props {
  quakes: Quake[]
  /** Quakes that just appeared in the feed — rendered as bright flash rings. */
  flashes: Quake[]
  iss: IssState | null
  /** Parsed TLE sets; propagation runs inside this component, off the React path. */
  sats: TrackedSat[]
  /** Live Kp index for the aurora ovals (null until the first NOAA reading). */
  kp: number | null
  followIss: boolean
  /** User grabbed the globe while following — parent should drop follow mode. */
  onFollowBroken: () => void
  /** Click on the ISS model toggles follow mode. */
  onIssClick: () => void
  onQuakeClick: (quake: Quake) => void
  onReady: () => void
}

const SUN_REFRESH_MS = 60_000
const SAT_TICK_MS = 1_000
const CLOUDS_ALTITUDE = 0.006
const CLOUDS_DEG_PER_FRAME = -0.012

/** One datum for the objects layer: a tracked satellite or the ISS itself. */
interface OrbitObject extends SatPos {
  kind: 'sat' | 'iss'
  velocityKmh?: number
  sat?: TrackedSat
}

/** Third-party text ends up in HTML tooltips — escape it. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function tooltip(html: string): string {
  return `<div style="font-family:sans-serif;font-size:12px;background:rgba(7,9,15,.9);padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15)">${html}</div>`
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
  followIss,
  onFollowBroken,
  onIssClick,
  onQuakeClick,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const onFollowBrokenRef = useRef(onFollowBroken)
  const onIssClickRef = useRef(onIssClick)
  const onReadyRef = useRef(onReady)
  const followRef = useRef(followIss)
  useEffect(() => {
    onFollowBrokenRef.current = onFollowBroken
    onIssClickRef.current = onIssClick
    onReadyRef.current = onReady
    followRef.current = followIss
  }, [onFollowBroken, onIssClick, onReady, followIss])

  // the globe slowly spins as an opening showcase — first user touch stops it for good
  const userInteractedRef = useRef(false)

  // orbit-layer data lives outside React: the 1 Hz propagation loop mutates
  // these stable objects and pushes them straight into the globe
  const issDatumRef = useRef<OrbitObject>({ kind: 'iss', name: 'ISS', lat: 0, lng: 0, altKm: 420 })
  const orbitObjectsRef = useRef<OrbitObject[]>([])
  const trailNameRef = useRef<string | null>(null)

  // one-time globe setup
  useEffect(() => {
    if (!containerRef.current) return
    const globe = new Globe(containerRef.current)
      .backgroundImageUrl('night-sky.png')
      .atmosphereColor('#7dd3fc')
      .atmosphereAltitude(0.18)
      .pointOfView({ lat: 25, lng: 15, altitude: 2.2 }, 0)

    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.45
    const onDragStart = () => {
      userInteractedRef.current = true
      globe.controls().autoRotate = false
      if (followRef.current) onFollowBrokenRef.current()
    }
    globe.controls().addEventListener('start', onDragStart)

    // one Sun for everything: the globe shader and the cloud layer share this
    // uniform, refreshed from the real subsolar point once a minute
    const sunUniform = { value: new THREE.Vector3(1, 0, 0) }
    const applySun = () => {
      const sun = subsolarPoint(new Date())
      const { x, y, z } = globe.getCoords(sun.lat, sun.lng, 0)
      sunUniform.value.set(x, y, z).normalize()
    }
    applySun()
    const sunTimer = setInterval(applySun, SUN_REFRESH_MS)

    // real day & night: NASA Blue Marble blended into city lights along the
    // live terminator
    const loader = new THREE.TextureLoader()
    void Promise.all([
      loader.loadAsync('earth-blue-marble.jpg'),
      loader.loadAsync('earth-night.jpg'),
    ]).then(([day, night]) => {
      if (!globeRef.current) return // unmounted while loading
      globe.globeMaterial(makeDayNightMaterial(day, night, sunUniform))
      onReadyRef.current()
    })

    // slowly drifting cloud layer just above the surface, fading out at night
    let clouds: THREE.Mesh | null = null
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
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(globe.getGlobeRadius() * (1 + CLOUDS_ALTITUDE), 64, 64),
        cloudsMaterial,
      )
      globe.scene().add(clouds)
      const rotate = () => {
        if (clouds) clouds.rotation.y += (CLOUDS_DEG_PER_FRAME * Math.PI) / 180
        cloudsRaf = requestAnimationFrame(rotate)
      }
      cloudsRaf = requestAnimationFrame(rotate)
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
      if (sunTimer) clearInterval(sunTimer)
      cancelAnimationFrame(cloudsRaf)
      if (clouds) {
        globe.scene().remove(clouds)
        clouds.geometry.dispose()
        ;(clouds.material as THREE.MeshPhongMaterial).map?.dispose()
        ;(clouds.material as THREE.MeshPhongMaterial).dispose()
        clouds = null
      }
      globe.controls().removeEventListener('start', onDragStart)
      window.removeEventListener('resize', onResize)
      globe._destructor()
      globeRef.current = null
    }
  }, [])

  // aurora ovals around the geomagnetic poles, scaled by the live Kp index
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || kp === null) return
    globe
      .polygonsData(auroraOvals(kp))
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
  }, [kp])

  // earthquakes: glowing points + ripple rings (steady on M4+, bright flash on brand-new)
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe
      .pointsData(quakes)
      .pointLat((d) => (d as Quake).lat)
      .pointLng((d) => (d as Quake).lng)
      .pointColor((d) => magColor((d as Quake).mag))
      .pointAltitude(0.01)
      .pointRadius((d) => Math.max(0.12, (d as Quake).mag * 0.09))
      .onPointClick((d) => onQuakeClick(d as Quake))
      .pointLabel((d) => {
        const q = d as Quake
        return tooltip(`<b>M ${q.mag.toFixed(1)}</b> · ${escapeHtml(q.place)}`)
      })

    const rings: RingDatum[] = [
      ...quakes
        .filter((q) => q.mag >= 4)
        .map((q) => ({ lat: q.lat, lng: q.lng, mag: q.mag, flash: false })),
      ...flashes.map((q) => ({ lat: q.lat, lng: q.lng, mag: q.mag, flash: true })),
    ]
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
  }, [quakes, flashes, onQuakeClick])

  // orbit engine: SGP4-propagate all satellites every second and move their
  // meshes directly — React never sees the 1 Hz churn
  useEffect(() => {
    const globe = globeRef.current
    if (!globe || sats.length === 0) return

    const byName = new Map<string, OrbitObject>()
    for (const s of sats) {
      byName.set(s.name, { kind: 'sat', name: s.name, lat: 0, lng: 0, altKm: 0, sat: s })
    }

    const refresh = () => {
      const objects: OrbitObject[] = []
      const now = new Date()
      for (const p of propagateSats(sats, now)) {
        const o = byName.get(p.name)
        if (!o) continue
        o.lat = p.lat
        o.lng = p.lng
        o.altKm = p.altKm
        objects.push(o)
      }
      objects.push(issDatumRef.current)
      orbitObjectsRef.current = objects
      globe.objectsData(objects)
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
          const speed = o.velocityKmh
            ? ` · ${Math.round(o.velocityKmh).toLocaleString('en-US')} km/h`
            : ''
          return tooltip(`🛰 <b>ISS</b> · ${Math.round(o.altKm)} km${speed} · click to follow`)
        }
        return tooltip(`🛰 <b>${escapeHtml(o.name)}</b> · ${Math.round(o.altKm)} km · click for orbit`)
      })
      .onObjectClick((d) => {
        const o = d as OrbitObject
        if (o.kind === 'iss') {
          onIssClickRef.current()
          return
        }
        // toggle a one-orbit trail for the clicked satellite
        if (trailNameRef.current === o.name || !o.sat) {
          trailNameRef.current = null
          globe.pathsData([])
          return
        }
        trailNameRef.current = o.name
        const track = orbitTrack(o.sat, new Date()).map(
          (p) => [p.lat, p.lng, globeAltitude(p.altKm)] as [number, number, number],
        )
        globe
          .pathsData([track])
          .pathPoints((d) => d as [number, number, number][])
          .pathPointLat((p) => (p as number[])[0])
          .pathPointLng((p) => (p as number[])[1])
          .pathPointAlt((p) => (p as number[])[2])
          .pathColor(() => ['rgba(165, 232, 255, 0.85)', 'rgba(56, 189, 248, 0.15)'])
          .pathStroke(1.6)
          .pathDashLength(0.05)
          .pathDashGap(0.012)
          .pathDashAnimateTime(12_000)
      })

    refresh()
    const timer = setInterval(refresh, SAT_TICK_MS)
    return () => {
      clearInterval(timer)
      globe.pathsData([])
      trailNameRef.current = null
    }
  }, [sats])

  // ISS live telemetry feeds its orbit-layer datum + floating name tag
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    if (iss) {
      const d = issDatumRef.current
      d.lat = iss.lat
      d.lng = iss.lng
      d.altKm = iss.altitudeKm
      d.velocityKmh = iss.velocityKmh
      if (orbitObjectsRef.current.length > 0) globe.objectsData(orbitObjectsRef.current)
    }
    globe
      .htmlElementsData(iss ? [iss] : [])
      .htmlLat((d) => (d as IssState).lat)
      .htmlLng((d) => (d as IssState).lng)
      .htmlAltitude((d) => globeAltitude((d as IssState).altitudeKm) + 0.035)
      .htmlElement(() => {
        const el = document.createElement('div')
        el.textContent = 'ISS'
        el.style.cssText =
          'pointer-events:none;font:600 10px sans-serif;color:#e2e8f0;text-shadow:0 0 6px #000,0 0 12px rgba(125,211,252,.7)'
        return el
      })
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
