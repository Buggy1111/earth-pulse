/** One-time globe scene setup: create the globe.gl instance, wire the sky,
 * surface and pointer feature modules, handle resize, and return the cleanup.
 * Split out of GlobeView so the component stays a thin React-wiring root. */

import Globe, { type GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import type { LayerState } from '../hud/types'
import { setupPointer } from './pointer'
import { setupSky } from './sky'
import { setupSurface } from './surface'
import { SUNLIT_LAYER } from './solar'
import type { StarlinkLayer } from './starlinkLayer'
import type { GlobeViewProps } from './globeView.types'

export interface SceneSetupDeps {
  /** Latest props, mirrored for non-React consumers (event listeners). */
  cb: { current: GlobeViewProps }
  globeRef: { current: GlobeInstance | null }
  initialPovRef: { current: { lat: number; lng: number; altitude: number } | null }
  userInteractedRef: { current: boolean }
  ecoRef: { current: boolean }
  solarTimeRef: { current: { realMs: number; simMs: number; warp: number } }
  timeOffsetMsRef: { current: number }
  layersRef: { current: LayerState }
  textureResRef: { current: '2k' | '8k' }
  gibsActiveRef: { current: boolean }
  globeMaterialRef: { current: THREE.ShaderMaterial | null }
  skyRef: { current: ReturnType<typeof setupSky> | null }
  applySkyRef: { current: (date: Date) => void }
  moonMeshRef: { current: THREE.Mesh | null }
  surfaceRef: { current: ReturnType<typeof setupSurface> | null }
  starlinkRef: { current: StarlinkLayer | null }
  planetMeshesRef: { current: Map<string, THREE.Object3D> }
  sunMeshRef: { current: THREE.Mesh | null }
  pinTargetRef: { current: THREE.Object3D | null }
  followRef: { current: boolean }
  tourRef: { current: boolean }
  moonModeRef: { current: boolean }
  solarModeRef: { current: boolean }
}

/** Build the globe + sky + surface + pointer once; returns the cleanup. */
export function setupScene(container: HTMLDivElement, deps: SceneSetupDeps): () => void {
  const fromLink = deps.initialPovRef.current
  const globe = new Globe(container)
    .backgroundColor('#000005')
    .atmosphereColor('#7dd3fc')
    .atmosphereAltitude(0.18)
    .pointOfView(fromLink ?? { lat: 25, lng: 15, altitude: 2.2 }, 0)

  // a shared link IS the view — don't auto-rotate away from it
  deps.userInteractedRef.current = !!fromLink
  globe.controls().autoRotate = !fromLink
  globe.controls().autoRotateSpeed = 0.45
  globe.renderer().setPixelRatio(deps.ecoRef.current ? 1 : Math.min(window.devicePixelRatio, 2))
  // solar-system bodies live on SUNLIT_LAYER (lit only by the Sun's light)
  ;(globe.camera() as THREE.PerspectiveCamera).layers.enable(SUNLIT_LAYER)

  const simNowMs = () => {
    const t = deps.solarTimeRef.current
    return t.simMs + (Date.now() - t.realMs) * t.warp + deps.timeOffsetMsRef.current
  }
  const sky = setupSky(globe, simNowMs)
  deps.skyRef.current = sky
  deps.applySkyRef.current = sky.applySky
  deps.moonMeshRef.current = sky.moonMesh

  const surface = setupSurface(globe, {
    sunUniform: sky.sunUniform,
    layersRef: deps.layersRef,
    textureRes: deps.textureResRef.current,
    gibsActiveRef: deps.gibsActiveRef,
    isAlive: () => deps.globeRef.current !== null,
    onReady: () => deps.cb.current.onReady(),
    onMaterial: (m) => (deps.globeMaterialRef.current = m),
  })
  deps.surfaceRef.current = surface

  const disposePointer = setupPointer(globe, {
    moonMesh: sky.moonMesh,
    apolloMarkers: sky.apolloMarkers,
    planetMeshesRef: deps.planetMeshesRef,
    sunMeshRef: deps.sunMeshRef,
    pinTargetRef: deps.pinTargetRef,
    userInteractedRef: deps.userInteractedRef,
    followRef: deps.followRef,
    tourRef: deps.tourRef,
    moonModeRef: deps.moonModeRef,
    solarModeRef: deps.solarModeRef,
    onFollowBroken: () => deps.cb.current.onFollowBroken(),
    onTourBroken: () => deps.cb.current.onTourBroken(),
    onMoonEnter: () => deps.cb.current.onMoonEnter(),
    onApolloPick: (s) => deps.cb.current.onApolloPick(s),
    onPlanetPick: (id) => deps.cb.current.onPlanetPick(id),
    onPovChange: (p) => deps.cb.current.onPovChange(p),
  })

  const onResize = () => globe.width(window.innerWidth).height(window.innerHeight)
  onResize()
  window.addEventListener('resize', onResize)

  deps.globeRef.current = globe
  // e2e hook: headless tests steer the camera through this handle
  ;(window as unknown as Record<string, unknown>).__earthPulseGlobe = globe
  return () => {
    deps.globeRef.current = null
    disposePointer()
    surface.dispose()
    sky.dispose()
    deps.moonMeshRef.current = null
    deps.starlinkRef.current?.dispose()
    deps.starlinkRef.current = null
    window.removeEventListener('resize', onResize)
    globe._destructor()
  }
}

/** Swap the day/night globe textures when toggling eco mode (2k ↔ 8k). The
 * caller has already set textureResRef to `wanted`; `isStillWanted` lets a late
 * load bail if the user toggled again or the globe was torn down. */
export function swapGlobeTextures(
  material: THREE.ShaderMaterial,
  wanted: '2k' | '8k',
  isStillWanted: () => boolean,
): void {
  const loader = new THREE.TextureLoader()
  void Promise.all([
    loader.loadAsync(`earth-day-${wanted}.jpg`),
    loader.loadAsync(`earth-night-${wanted}.jpg`),
  ])
    .then(([day, night]) => {
      if (!isStillWanted()) return
      day.colorSpace = THREE.SRGBColorSpace
      night.colorSpace = THREE.SRGBColorSpace
      for (const [key, tex] of [['dayTexture', day], ['nightTexture', night]] as const) {
        const old = material.uniforms[key].value as THREE.Texture
        material.uniforms[key].value = tex
        old.dispose()
      }
    })
    .catch((err) => {
      // a transient fetch error shouldn't surface as an unhandled rejection —
      // keep whatever textures the globe already has
      console.warn('Globe day/night textures failed to load:', err)
    })
}
