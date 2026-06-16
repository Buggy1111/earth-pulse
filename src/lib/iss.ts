/** Where The ISS At — live position of the International Space Station. */

export const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544'

export interface IssState {
  lat: number
  lng: number
  altitudeKm: number
  velocityKmh: number
  visibility: string
}

interface IssResponse {
  latitude: number
  longitude: number
  altitude: number
  velocity: number
  visibility: string
}

/** Validate the live API payload before it reaches the renderer: a malformed
 * or error response must not put NaN/undefined into the follow-ISS camera
 * (`globe.pointOfView`) — one NaN there breaks the view. Returns null on bad
 * data; callers already treat ISS as `IssState | null`. */
export function parseIss(data: Partial<IssResponse> | null | undefined): IssState | null {
  if (!data || !Number.isFinite(data.latitude) || !Number.isFinite(data.longitude)) return null
  return {
    lat: data.latitude as number,
    lng: data.longitude as number,
    altitudeKm: Number.isFinite(data.altitude) ? (data.altitude as number) : 0,
    velocityKmh: Number.isFinite(data.velocity) ? (data.velocity as number) : 0,
    visibility: typeof data.visibility === 'string' ? data.visibility : 'unknown',
  }
}
