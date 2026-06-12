/** Pointer & camera plumbing: drag-stops-modes, raycast clicks on the Moon /
 * Apollo markers / planets, the pinned-orbit-target override (globe.gl resets
 * controls.target to origin on every 'change'), and share-URL pov reporting. */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import type { ApolloSite } from '../../lib/moon'

export interface PointerDeps {
  moonMesh: THREE.Mesh
  apolloMarkers: THREE.Mesh[]
  planetMeshesRef: { current: Map<string, THREE.Object3D> }
  sunMeshRef: { current: THREE.Mesh | null }
  pinTargetRef: { current: THREE.Object3D | null }
  userInteractedRef: { current: boolean }
  followRef: { current: boolean }
  tourRef: { current: boolean }
  moonModeRef: { current: boolean }
  solarModeRef: { current: boolean }
  onFollowBroken: () => void
  onTourBroken: () => void
  onMoonEnter: () => void
  onApolloPick: (site: ApolloSite | null) => void
  onPlanetPick: (id: string) => void
  onPovChange: (pov: { lat: number; lng: number; altitude: number }) => void
}

export function setupPointer(globe: GlobeInstance, deps: PointerDeps): () => void {
  const onDragStart = () => {
    deps.userInteractedRef.current = true
    globe.controls().autoRotate = false
    if (deps.followRef.current) deps.onFollowBroken()
    if (deps.tourRef.current) deps.onTourBroken()
  }
  globe.controls().addEventListener('start', onDragStart)

  // click handling for the Moon, Apollo markers and planets (not globe.gl layers)
  const raycaster = new THREE.Raycaster()
  raycaster.layers.enableAll() // solar bodies live on SUNLIT_LAYER
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
    if (deps.solarModeRef.current) {
      const bodies: THREE.Object3D[] = [...deps.planetMeshesRef.current.values()]
      if (deps.sunMeshRef.current) bodies.push(deps.sunMeshRef.current)
      const hit = raycaster.intersectObjects(bodies, true)[0]
      if (hit) {
        // moons are focusable themselves; otherwise walk up to the system
        let o: THREE.Object3D | null = hit.object
        while (o && !o.userData.moonId && !o.userData.planetId) o = o.parent
        const id = (o?.userData.moonId ?? o?.userData.planetId) as string | undefined
        if (id) deps.onPlanetPick(id)
      }
    } else if (deps.moonModeRef.current) {
      const hit = raycaster.intersectObjects(deps.apolloMarkers, false)[0]
      deps.onApolloPick((hit?.object.userData.site as ApolloSite) ?? null)
    } else {
      const hit = raycaster.intersectObject(deps.moonMesh, true)[0]
      if (hit) deps.onMoonEnter()
    }
  }
  globe.renderer().domElement.addEventListener('pointerdown', onPtrDown)
  globe.renderer().domElement.addEventListener('click', onCanvasClick)

  // globe.gl pins controls.target to (0,0,0) in its own 'change' listener —
  // ours registers later, so per event we get the last word and re-pin to
  // whatever body we're orbiting (Moon, Sun, a planet)
  const pinWorld = new THREE.Vector3()
  const keepPinnedTarget = () => {
    const pin = deps.pinTargetRef.current
    if (!pin) return
    const controls = globe.controls()
    controls.target.copy(pin.getWorldPosition(pinWorld))
    // globe.gl just scaled rotate/zoom speed by "altitude above Earth" —
    // nonsense when orbiting Saturn 20k units away. Constant feel instead.
    controls.rotateSpeed = 0.7
    controls.zoomSpeed = 0.9
  }
  globe.controls().addEventListener('change', keepPinnedTarget)

  // report the camera so the share URL follows the user around: instantly
  // when an interaction ends, debounced otherwise (auto-rotate fires
  // 'change' every frame and would starve a plain debounce)
  let povTimer: ReturnType<typeof setTimeout> | undefined
  const reportPov = () => {
    // lunar/solar cameras don't map to a shareable Earth view
    if (deps.moonModeRef.current || deps.solarModeRef.current) return
    deps.onPovChange(globe.pointOfView())
  }
  const onCamChange = () => {
    clearTimeout(povTimer)
    povTimer = setTimeout(reportPov, 600)
  }
  globe.controls().addEventListener('change', onCamChange)
  globe.controls().addEventListener('end', reportPov)

  return () => {
    globe.controls().removeEventListener('start', onDragStart)
    globe.renderer().domElement.removeEventListener('pointerdown', onPtrDown)
    globe.renderer().domElement.removeEventListener('click', onCanvasClick)
    globe.controls().removeEventListener('change', keepPinnedTarget)
    globe.controls().removeEventListener('change', onCamChange)
    globe.controls().removeEventListener('end', reportPov)
    clearTimeout(povTimer)
  }
}
