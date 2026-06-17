/** Shared HUD types: which globe layers exist and what an orbit entry is. */

export interface LayerState {
  sats: boolean
  orbits: boolean
  iss: boolean
  quakes: boolean
  events: boolean
  aurora: boolean
  clouds: boolean
  borders: boolean
  labels: boolean
  volcanoes: boolean
  detail: boolean
}

export interface OrbitEntry {
  id: string
  name: string
}

export const LAYER_LABELS: { key: keyof LayerState; label: string }[] = [
  { key: 'sats', label: '🛰 satellites' },
  { key: 'orbits', label: '🛰 orbit lines' },
  { key: 'iss', label: '🛰 ISS' },
  { key: 'quakes', label: '🌋 earthquakes' },
  { key: 'events', label: '🔥 natural events (NASA EONET)' },
  { key: 'aurora', label: '🌌 aurora' },
  { key: 'clouds', label: '☁️ clouds' },
  { key: 'borders', label: '🗺 country borders' },
  { key: 'labels', label: '🏷 country names (zoom in)' },
  { key: 'volcanoes', label: '🌋 volcanoes (1215, Holocene)' },
  { key: 'detail', label: '🔎 hi-res zoom imagery' },
]

