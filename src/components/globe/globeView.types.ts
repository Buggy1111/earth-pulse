/** Public props for the GlobeView composition root, split out to keep the
 * component file focused on the React wiring. */

import type { IssState } from '../../lib/iss'
import type { Quake } from '../../lib/quakes'
import type { ApolloSite } from '../../lib/moon'
import type { TrackedSat } from '../../lib/satellites'
import type { EarthEvent } from '../../lib/events'
import type { GibsLayer } from '../../lib/gibs'
import type { StarPick } from '../../lib/stars'
import type { LayerState } from '../hud/types'

export interface GlobeViewProps {
  quakes: Quake[]
  /** Quakes that just appeared in the feed — rendered as bright flash rings. */
  flashes: Quake[]
  iss: IssState | null
  /** Parsed TLE sets; propagation runs inside the orbit engine, off React. */
  sats: TrackedSat[]
  /** Live Kp index for the aurora ovals (null until the first NOAA reading). */
  kp: number | null
  layers: LayerState
  /** NORAD ids whose orbits are drawn (managed by the parent via onSatClick). */
  selectedOrbitIds: string[]
  userLoc: { lat: number; lng: number } | null
  /** Bumped on every locate click so we re-fly even to an unchanged position. */
  locVersion: number
  /** Eco/performance mode: 4K textures, 1× pixel ratio, 30 Hz propagation. */
  eco: boolean
  /** "Earth spins" view: camera follows the Sun so the Earth appears to rotate. */
  earthSpin: boolean
  /** Camera restored from a shared link — overrides the default opening view. */
  initialPov: { lat: number; lng: number; altitude: number } | null
  onPovChange: (pov: { lat: number; lng: number; altitude: number }) => void
  /** Satellite picked in the search box — fly the camera to it. */
  focusSat: { id: string; v: number } | null
  /** Satellite to lock onto: camera flies with it & orbits around it; null releases. */
  followSat: { id: string; name: string } | null
  /** Quake picked in the HUD — fly the camera there. */
  flyTo: { lat: number; lng: number; v: number } | null
  /** Bumped to recenter the camera on the default Earth view. */
  resetView: number
  /** Pause the globe's render loop while a fullscreen overlay (Sky AR) covers
   * it — saves GPU/battery and frees the main thread for the overlay. */
  paused?: boolean
  /** Reference "now" for quake age/glow — the timeline slider rewinds it. */
  simNow: number
  tour: boolean
  onTourBroken: () => void
  moonMode: boolean
  onMoonEnter: () => void
  onApolloPick: (site: ApolloSite | null) => void
  solarMode: boolean
  /** Which planet the camera orbits in solar mode (null = Sun overview). */
  focusPlanet: string | null
  onPlanetPick: (id: string) => void
  /** A star was clicked in the solar sky — opens its info card. */
  onStarPick: (s: StarPick | null) => void
  /** The focused star, or null when its card is closed (drives fly-back). */
  pickedStar: StarPick | null
  /** Simulated-time anchor: simMs advances `warp`× faster than real time. */
  solarTime: { realMs: number; simMs: number; warp: number }
  followIss: boolean
  onFollowBroken: () => void
  onIssClick: () => void
  onSatClick: (id: string, name: string) => void
  onQuakeClick: (quake: Quake) => void
  events: EarthEvent[]
  onEventClick: (e: EarthEvent) => void
  /** Active NASA GIBS data layer (null = live day/night globe). */
  gibsLayer: GibsLayer | null
  /** YYYY-MM-DD imagery date for the GIBS layer (time playback). */
  gibsDate: string
  onReady: () => void
}
