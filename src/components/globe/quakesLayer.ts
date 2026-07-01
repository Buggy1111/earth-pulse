/** Earthquake visuals: additive glow sprites (warm ramp, age fade) and the
 * ripple rings (steady on M4+, bright flash rings on brand-new events). */

import type { GlobeInstance } from 'globe.gl'
import * as THREE from 'three'
import { glowOpacity, glowScale, magColor, magRadius, type Quake } from '../../lib/quakes'
import { escapeHtml, getGlowTexture, tooltip, type RingDatum } from './helpers'

/** Ring data must keep object identity between renders — three-globe diffs by
 * identity and tears down/rebuilds every ring whose object changed, holding the
 * dead groups for another 30 s (removeDelay). Building this array inside the
 * per-second opacity tick meant every ring restarted its ripple ~1× a second and
 * the scene accumulated zombie groups — the caller memoises this on
 * [quakes, flashes, show] instead. */
export function buildQuakeRings(quakes: Quake[], flashes: Quake[], show: boolean): RingDatum[] {
  if (!show) return []
  return [
    ...quakes
      .filter((q) => q.mag >= 4)
      .map((q) => ({ lat: q.lat, lng: q.lng, mag: q.mag, flash: false })),
    ...flashes.map((q) => ({ lat: q.lat, lng: q.lng, mag: q.mag, flash: true })),
  ]
}

export function applyQuakeLayers(
  globe: GlobeInstance,
  quakes: Quake[],
  rings: RingDatum[],
  show: boolean,
  simNow: number,
  onQuakeClick: (quake: Quake) => void,
): void {
  globe
    .customLayerData(show ? quakes : [])
    .customThreeObject((d) => {
      const q = d as Quake
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          // clone the shared glow: three-globe's custom-layer teardown disposes
          // material.map when a quake ages out of the 24 h window (~every refresh).
          // A clone shares the source canvas (no extra CPU memory) but owns its GPU
          // upload, so disposing it can't yank the texture out from under the Sun,
          // Moon, events, probes and stars that also use getGlowTexture().
          map: getGlowTexture().clone(),
          color: magColor(q.mag),
          transparent: true,
          opacity: glowOpacity(q.time, simNow),
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
        simNow,
      )
    })
    .customLayerLabel((d) => {
      const q = d as Quake
      return tooltip(`<b>M ${q.mag.toFixed(1)}</b> · ${escapeHtml(q.place)}`)
    })
    .onCustomLayerClick((d) => onQuakeClick(d as Quake))

  globe
    .ringsData(rings)
    .ringLat((d) => (d as RingDatum).lat)
    .ringLng((d) => (d as RingDatum).lng)
    // plain string = solid colour; returning a nested function switches three-globe
    // to its gradient path, which allocates a THREE.Color per ring per frame
    .ringColor((d: object) => {
      const r = d as RingDatum
      return r.flash ? '#f8fafc' : magColor(r.mag)
    })
    .ringMaxRadius((d) => {
      const r = d as RingDatum
      return r.flash ? Math.max(3, magRadius(r.mag) * 1.6) : magRadius(r.mag)
    })
    .ringPropagationSpeed((d) => ((d as RingDatum).flash ? 4 : 1.4))
    .ringRepeatPeriod((d) => ((d as RingDatum).flash ? 600 : 1800))
}
