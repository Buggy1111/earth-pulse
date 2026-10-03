export interface AlertQuake {
  id: string
  lat: number
  lng: number
  mag: number
  depthKm: number
  place: string
  time: number
  url: string | null
  src: 'USGS' | 'EMSC'
}
export interface AlertRegion {
  name: string
  minMagnitude: number
  bbox?: [number, number, number, number]
  circle?: { lat: number; lng: number; radiusKm: number }
}
export interface AlertConfig {
  worldwideMinMagnitude: number | null
  regions?: AlertRegion[]
}
export interface SentEntry {
  id: string
  time: number
  lat: number
  lng: number
  mag: number
}
export interface AlertState {
  sent: SentEntry[]
}
export interface Alert {
  quake: AlertQuake
  rules: string[]
}
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number
export function parseUsgs(json: unknown): AlertQuake[]
export function parseEmsc(json: unknown): AlertQuake[]
export function isSameEvent(a: Pick<AlertQuake, 'time' | 'mag' | 'lat' | 'lng'>, b: Pick<AlertQuake, 'time' | 'mag' | 'lat' | 'lng'>): boolean
export function matchingRules(q: AlertQuake, config: AlertConfig): string[]
export function selectAlerts(quakes: AlertQuake[], config: AlertConfig, state: AlertState, nowMs: number, maxAgeMin?: number): Alert[]
export function nextState(state: AlertState, alerts: Alert[], nowMs: number, keepDays?: number): AlertState
export function formatMessage(alert: Alert): string
export function validateConfig(config: unknown): string | null
