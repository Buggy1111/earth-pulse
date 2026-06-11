import Globe, { type GlobeInstance } from 'globe.gl'
import { useEffect, useRef } from 'react'
import type { IssState } from '../lib/iss'
import { magColor, magRadius, type Quake } from '../lib/quakes'
import { nightPolygon } from '../lib/sun'

interface Props {
  quakes: Quake[]
  iss: IssState | null
  onQuakeClick: (quake: Quake) => void
}

const NIGHT_REFRESH_MS = 60_000

/** USGS `place` is third-party text that ends up in an HTML tooltip — escape it. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

function nightGeometry(d: object) {
  return {
    type: 'Polygon' as const,
    coordinates: [(d as { ring: [number, number][] }).ring],
  }
}

export function GlobeView({ quakes, iss, onQuakeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const globeRef = useRef<GlobeInstance | null>(null)

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

    globe.controls().autoRotate = true
    globe.controls().autoRotateSpeed = 0.45

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

    const onResize = () => {
      globe.width(window.innerWidth).height(window.innerHeight)
    }
    onResize()
    window.addEventListener('resize', onResize)

    globeRef.current = globe
    return () => {
      clearInterval(nightTimer)
      window.removeEventListener('resize', onResize)
      globe._destructor()
      globeRef.current = null
    }
  }, [])

  // earthquakes: glowing points + expanding ripple rings
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
        return `<div style="font-family:sans-serif;font-size:12px;background:rgba(7,9,15,.9);padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.15)">
          <b>M ${q.mag.toFixed(1)}</b> · ${escapeHtml(q.place)}</div>`
      })

    const strong = quakes.filter((q) => q.mag >= 4)
    globe
      .ringsData(strong)
      .ringLat((d) => (d as Quake).lat)
      .ringLng((d) => (d as Quake).lng)
      .ringColor((d: object) => () => magColor((d as Quake).mag))
      .ringMaxRadius((d) => magRadius((d as Quake).mag))
      .ringPropagationSpeed(1.4)
      .ringRepeatPeriod(1800)
  }, [quakes, onQuakeClick])

  // ISS marker
  useEffect(() => {
    const globe = globeRef.current
    if (!globe) return
    globe
      .htmlElementsData(iss ? [iss] : [])
      .htmlLat((d) => (d as IssState).lat)
      .htmlLng((d) => (d as IssState).lng)
      .htmlAltitude(0.08)
      .htmlElement(() => {
        const el = document.createElement('div')
        el.innerHTML =
          '<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">' +
          '<div style="width:10px;height:10px;border-radius:50%;background:#fff;box-shadow:0 0 14px 4px rgba(255,255,255,.8)"></div>' +
          '<div style="margin-top:3px;font:600 10px sans-serif;color:#e2e8f0;text-shadow:0 0 6px #000">ISS</div></div>'
        return el
      })
  }, [iss])

  return <div ref={containerRef} className="fixed inset-0" />
}
