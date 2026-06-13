/** EONET natural-event markers on the globe — colour-coded vertical pins per
 * category (wildfire, storm, volcano, ice…). Uses globe.gl's points layer,
 * which nothing else claims, so it stays independent of the quake/sat layers. */

import type { GlobeInstance } from 'globe.gl'
import { eventMeta, type EarthEvent } from '../../lib/events'
import { escapeHtml, tooltip } from './helpers'

export function applyEventsLayer(
  globe: GlobeInstance,
  events: EarthEvent[],
  show: boolean,
  onClick: (e: EarthEvent) => void,
): void {
  globe
    .pointsData(show ? events : [])
    .pointLat((d) => (d as EarthEvent).lat)
    .pointLng((d) => (d as EarthEvent).lng)
    .pointColor((d) => eventMeta((d as EarthEvent).category).color)
    .pointAltitude(0.04)
    .pointRadius(0.32)
    .pointResolution(8)
    .pointLabel((d) => {
      const e = d as EarthEvent
      const m = eventMeta(e.category)
      const mag = e.magnitude ? ` · ${Math.round(e.magnitude).toLocaleString('en-US')} ${e.magnitudeUnit ?? ''}` : ''
      return tooltip(`${m.icon} <b>${escapeHtml(e.title)}</b> · ${m.label}${mag}`)
    })
    .onPointClick((d) => onClick(d as EarthEvent))
}
