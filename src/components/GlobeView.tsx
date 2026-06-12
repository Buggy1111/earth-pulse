import Globe, { type GlobeInstance } from 'globe.gl'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { IssState } from '../lib/iss'
import { magColor, magRadius, type Quake } from '../lib/quakes'
import { globeAltitude, type SatPos } from '../lib/satellites'
import { nightPolygon } from '../lib/sun'
import { makeIssObject, makeSatelliteObject } from './spaceObjects'

interface Props {
  quakes: Quake[]
  /** Quakes that just appeared in the feed — rendered as bright flash rings. */
  flashes: Quake[]
  iss: IssState | null
  satellites: SatPos[]
  followIss: boolean
  /** User grabbed the globe while following — parent should drop follow mode. */
  onFollowBroken: () => void
  onQuakeClick: (quake: Quake) => void
  onReady: () => void
}

const NIGHT_REFRESH_MS = 60_000
const CLOUDS_ALTITUDE = 0.006
const CLOUDS_DEG_PER_FRAME = -0.012

/** One datum for the objects layer: a tracked satellite or the ISS itself. */
interface OrbitObject extends SatPos {
  kind: 'sat' | 'iss'
  velocityKmh?: number
}

/** Third-party text ends up in HTML tooltips — escape it. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function tooltip(html: string): string {
  return `<div style="font-family:sans-serif;font-size:12px;background:rgba(7,9,15,.9);padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15)">${html}</div>`
}

function nightGeometry(d: object) {
  return {
    type: 'Polygon' as const,
    coordinates: [(d as { ring: [number, number][] }).ring],
  }
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
  satellites,
  followIss,
  onFollowBroken,
  onQuakeClick,
  onReady,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)
  const onFollowBrokenRef = useRef(onFollowBroken)
  const onReadyRef = useRef(onReady)
  const followRef = useRef(followIss)
  useEffect(() => {
    onFollowBrokenRef.current = onFollowBroken
    onReadyRef.current = onReady
    followRef.current = followIss
  }, [onFollowBroken, onReady, followIss])

  // one-time globe setup
  useEffect(() => {
    if (!containerRef.current) return
    const globe = new Globe(containerRef.current)
      .globeImageUrl('earth-blue-marble.jpg')
      .bumpImageUrl('earth-topology.png')
      .backgroundImageUrl('night-sky.png')
      .atmosphereColor('#7dd3fc')
      .atmosphereAltitude(0.18)
      .pointOfView({ lat: 25, lng: 15, altitude: 2.2 }, 0)
      .onGlobeReady(() => onReadyRef.current())

    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.45
    const onDragStart = () => {
      if (followRef.current) onFollowBrokenRef.current()
    }
    globe.controls().addEventListener('start', onDragStart)

    // day/night terminator as a translucent polygon over the night hemisphere
    const applyNight = () => {
      globe
        .polygonsData([{ ring: nightPolygon(new Date()) }])
        .polygonCapColor(() => 'rgba(2, 6, 23, 0.55)')
        .polygonSideColor(() => 'rgba(0,0,0,0)')
        .polygonStrokeColor(() => 'rgba(125, 211, 252, 0.18)')
        .polygonAltitude(0.004)
        // globe.gl types GeoJSON coordinates loosely as number[] — cast the valid Polygon
        .polygonGeoJsonGeometry(
          nightGeometry as unknown as Parameters<GlobeInstance['polygonGeoJsonGeometry']>[0],
        )
    }
    applyNight()
    const nightTimer = setInterval(applyNight, NIGHT_REFRESH_MS)

    // slowly drifting cloud layer just above the surface
    let clouds: THREE.Mesh | null = null
    let cloudsRaf = 0
    new THREE.TextureLoader().load('clouds.png', (texture) => {
      if (!globeRef.current) return // unmounted before the texture arrived
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(globe.getGlobeRadius() * (1 + CLOUDS_ALTITUDE), 75, 75),
        new THREE.MeshPhongMaterial({ map: texture, transparent: true, opacity: 0.55 }),
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
      clearInterval(nightTimer)
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

  // orbit layer: ~150 satellites + the ISS as miniature 3D models.
  // Object identities stay stable across ticks, so the globe just moves the meshes.
  const issDatumRef = useRef<OrbitObject>({ kind: 'iss', name: 'ISS', lat: 0, lng: 0, altKm: 420 })
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    const objects: OrbitObject[] = satellites.map((s) =>
      Object.assign(s as OrbitObject, { kind: 'sat' as const }),
    )
    if (iss) {
      const d = issDatumRef.current
      d.lat = iss.lat
      d.lng = iss.lng
      d.altKm = iss.altitudeKm
      d.velocityKmh = iss.velocityKmh
      objects.push(d)
    }
    globe
      .objectsData(objects)
      .objectLat((d) => (d as OrbitObject).lat)
      .objectLng((d) => (d as OrbitObject).lng)
      .objectAltitude((d) => globeAltitude((d as OrbitObject).altKm))
      .objectThreeObject((d) =>
        (d as OrbitObject).kind === 'iss' ? makeIssObject() : makeSatelliteObject(),
      )
      .objectLabel((d) => {
        const o = d as OrbitObject
        if (o.kind === 'iss') {
          const speed = o.velocityKmh ? ` · ${Math.round(o.velocityKmh).toLocaleString('en-US')} km/h` : ''
          return tooltip(`🛰 <b>ISS</b> · ${Math.round(o.altKm)} km${speed}`)
        }
        return tooltip(`🛰 <b>${escapeHtml(o.name)}</b> · ${Math.round(o.altKm)} km`)
      })
  }, [satellites, iss])

  // floating "ISS" name tag just above the station model
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
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
    globe.controls().autoRotate = !followIss
    if (followIss && iss) {
      const altitude = Math.min(globe.pointOfView().altitude ?? 2.2, 1.6)
      globe.pointOfView({ lat: iss.lat, lng: iss.lng, altitude }, 900)
    }
  }, [followIss, iss])

  return <div ref={containerRef} className="fixed inset-0" />
}
