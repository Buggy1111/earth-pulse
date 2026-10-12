export interface QuakeLike {
  time: number
  mag: number
  lat: number
  lng: number
}
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number
export function isSameEvent(a: QuakeLike, b: QuakeLike): boolean
export function regionOf(place: string): string
