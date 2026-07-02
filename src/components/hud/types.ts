/** Shared HUD types: which globe layers exist and what an orbit entry is. */

export interface LayerState {
  sats: boolean
  orbits: boolean
  iss: boolean
  starlink: boolean
  quakes: boolean
  events: boolean
  aurora: boolean
  clouds: boolean
  borders: boolean
  labels: boolean
  volcanoes: boolean
  detail: boolean
}

/** Solar-mode layers: the view grew crowded (planets, ellipses, 11 probes with
 * trails, 8.9k stars, constellations) — each family toggles independently.
 * Scene objects carry `userData.solarLayer = <key>`; see applySolarLayers. */
export interface SolarLayerState {
  orbits: boolean
  labels: boolean
  probes: boolean
  stars: boolean
  constellations: boolean
}

export const SOLAR_LAYER_DEFAULTS: SolarLayerState = {
  orbits: true,
  labels: true,
  probes: true,
  stars: true,
  constellations: true,
}

export const SOLAR_LAYER_LABELS: { key: keyof SolarLayerState; label: string }[] = [
  { key: 'orbits', label: '🪐 orbit ellipses' },
  { key: 'labels', label: '🏷 planet names' },
  { key: 'probes', label: '🛰 spacecraft & trails' },
  { key: 'stars', label: '✨ stars' },
  { key: 'constellations', label: '🌌 constellations' },
]

export interface OrbitEntry {
  id: string
  name: string
}

export const LAYER_LABELS: { key: keyof LayerState; label: string }[] = [
  { key: 'sats', label: '🛰 satellites' },
  { key: 'orbits', label: '🛰 orbit lines' },
  { key: 'iss', label: '🛰 ISS' },
  { key: 'starlink', label: '🛰 Starlink swarm (10k+)' },
  { key: 'quakes', label: '🌋 earthquakes' },
  { key: 'events', label: '🔥 natural events (NASA EONET)' },
  { key: 'aurora', label: '🌌 aurora' },
  { key: 'clouds', label: '☁️ clouds' },
  { key: 'borders', label: '🗺 country borders' },
  { key: 'labels', label: '🏷 country names (zoom in)' },
  { key: 'volcanoes', label: '🌋 volcanoes (1215, Holocene)' },
  { key: 'detail', label: '🔎 hi-res zoom imagery' },
]

