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

export function parseIss(data: IssResponse): IssState {
  return {
    lat: data.latitude,
    lng: data.longitude,
    altitudeKm: data.altitude,
    velocityKmh: data.velocity,
    visibility: data.visibility,
  }
}
