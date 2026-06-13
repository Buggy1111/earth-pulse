/** Earth's surface stack: 8K/4K day-night textures, drifting clouds, the
 * Esri tile engine with night dimming, country borders + name labels and the
 * volcano points cloud. All driven by the shared Sun uniform. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { feature as topoFeature, mesh as topoMesh } from 'topojson-client'
import type { Topology, Objects } from 'topojson-specification'
import { geometryLabelPoint } from '../../lib/labels'
import { makeDayNightMaterial, sunlitClouds, sunlitTiles } from '../dayNightMaterial'
import type { LayerState } from '../hud/types'
import {
  CLOUDS_ALTITUDE,
  CLOUDS_DEG_PER_FRAME,
  getTriangleTexture,
  type CountryLabel,
} from './helpers'

export interface SurfaceOptions {
  sunUniform: { value: THREE.Vector3 }
  layersRef: { current: LayerState }
  /** Texture resolution: eco/fast = 2K (tiny, integrated GPUs fly), full = 8K. */
  textureRes: '2k' | '4k' | '8k'
  /** False once the component unmounted — async loaders bail out. */
  isAlive: () => boolean
  onReady: () => void
  onMaterial: (m: THREE.ShaderMaterial) => void
}

export interface Surface {
  cloudsRef: { current: THREE.Mesh | null }
  bordersRef: { current: THREE.LineSegments | null }
  volcanoesRef: { current: THREE.Points | null }
  updateTileEngine: () => void
  updateLabels: () => void
  dispose: () => void
}

export function setupSurface(globe: GlobeInstance, opts: SurfaceOptions): Surface {
  const { sunUniform, layersRef, isAlive } = opts
  const loader = new THREE.TextureLoader()

  // real day & night: day texture blended into city lights along the live
  // terminator (textures © Solar System Scope, CC BY 4.0)
  void Promise.all([
    loader.loadAsync(`earth-day-${opts.textureRes}.jpg`),
    loader.loadAsync(`earth-night-${opts.textureRes}.jpg`),
  ]).then(([day, night]) => {
    if (!isAlive()) return
    const material = makeDayNightMaterial(day, night, sunUniform)
    opts.onMaterial(material)
    globe.globeMaterial(material)
    opts.onReady()
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
  // night-side dimming: the engine creates tile materials lazily — patch new ones
  let tilesRoot: THREE.Object3D | null = null
  const patchTileMaterials = () => {
    if (!tilesRoot) {
      globe.scene().traverse((o) => {
        if ((o as { __globeObjType?: string }).__globeObjType === 'globe') tilesRoot = o
      })
    }
    tilesRoot?.traverse((o) => {
      const mesh = o as THREE.Mesh
      const m = mesh.material as THREE.MeshLambertMaterial | undefined
      if (mesh.isMesh && m?.type === 'MeshLambertMaterial' && !m.userData.sunPatched) {
        m.userData.sunPatched = true
        sunlitTiles(m, sunUniform)
      }
    })
  }
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

  // slowly drifting cloud layer just above the surface, fading out at night
  const cloudsRef: Surface['cloudsRef'] = { current: null }
  let cloudsRaf = 0
  loader.load('clouds.webp', (texture) => {
    if (!isAlive()) return
    const cloudsMaterial = new THREE.MeshPhongMaterial({
      map: texture,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    })
    sunlitClouds(cloudsMaterial, sunUniform)
    // fast mode halves the cloud sphere's tessellation — a transparent overdraw
    // pass is pure fill-rate cost on integrated GPUs and looks identical at this scale
    const cloudSeg = opts.textureRes === '2k' ? 32 : 64
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(globe.getGlobeRadius() * (1 + CLOUDS_ALTITUDE), cloudSeg, cloudSeg),
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

  // country borders + name labels from one Natural Earth 110m file
  const bordersRef: Surface['bordersRef'] = { current: null }
  let countryLabels: CountryLabel[] = []
  void fetch('geo/countries-110m.json')
    .then((r) => r.json())
    .then((topo: Topology<Objects>) => {
      if (!isAlive()) return
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

      const fc = topoFeature(topo, topo.objects.countries)
      const features = 'features' in fc ? fc.features : [fc]
      countryLabels = features.flatMap((f) => {
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
    const want =
      layersRef.current.labels &&
      countryLabels.length > 0 &&
      alt < (labelsShown ? LABELS_OFF : LABELS_ON)
    if (want !== labelsShown) {
      labelsShown = want
      globe.labelsData(want ? countryLabels : [])
    }
  }
  globe.controls().addEventListener('change', updateLabels)

  // 1215 Holocene volcanoes (Smithsonian GVP snapshot) as one Points cloud
  const volcanoesRef: Surface['volcanoesRef'] = { current: null }
  void fetch('geo/volcanoes.json')
    .then((r) => r.json())
    .then((volcanoes: { n: string; la: number; lo: number }[]) => {
      if (!isAlive()) return
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

  return {
    cloudsRef,
    bordersRef,
    volcanoesRef,
    updateTileEngine,
    updateLabels,
    dispose: () => {
      cancelAnimationFrame(cloudsRaf)
      clearInterval(tilePatchTimer)
      globe.controls().removeEventListener('change', updateTileEngine)
      globe.controls().removeEventListener('change', updateLabels)
      for (const ref of [cloudsRef, bordersRef, volcanoesRef] as const) {
        const obj = ref.current as THREE.Mesh | null
        if (!obj) continue
        globe.scene().remove(obj)
        obj.geometry.dispose()
        const m = obj.material as THREE.Material & { map?: THREE.Texture | null }
        m.map?.dispose()
        m.dispose()
        ref.current = null
      }
    },
  }
}
