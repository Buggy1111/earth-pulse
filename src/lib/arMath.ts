/** Augmented-reality sky maths: where a satellite sits in the observer's sky
 * (azimuth + elevation), and where that lands on screen given which way the
 * phone is pointing. Spherical Earth — plenty for a "hold your phone up and
 * see what's overhead" overlay. Pure + unit-tested; the camera/sensor plumbing
 * lives in the ArSky component. */

import { EARTH_RADIUS_KM } from './satellites'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

export interface LookAngles {
  /** Compass bearing to the satellite, degrees clockwise from north (0–360). */
  azimuthDeg: number
  /** Angle above the horizon, degrees (negative = below, not visible). */
  elevationDeg: number
  /** Slant range: straight-line distance observer → satellite, km. */
  rangeKm: number
}

function ecef(latDeg: number, lngDeg: number, altKm: number): [number, number, number] {
  const lat = latDeg * RAD
  const lng = lngDeg * RAD
  const r = EARTH_RADIUS_KM + altKm
  const cl = Math.cos(lat)
  return [r * cl * Math.cos(lng), r * cl * Math.sin(lng), r * Math.sin(lat)]
}

/** Topocentric look angles from an observer (on the ground) to a satellite,
 * via the local East-North-Up frame. */
export function lookAngles(
  observer: { lat: number; lng: number },
  sat: { lat: number; lng: number; altKm: number },
): LookAngles {
  const o = ecef(observer.lat, observer.lng, 0)
  const s = ecef(sat.lat, sat.lng, sat.altKm)
  const rx = s[0] - o[0]
  const ry = s[1] - o[1]
  const rz = s[2] - o[2]
  const lat = observer.lat * RAD
  const lng = observer.lng * RAD
  const sinLat = Math.sin(lat)
  const cosLat = Math.cos(lat)
  const sinLng = Math.sin(lng)
  const cosLng = Math.cos(lng)
  const e = -sinLng * rx + cosLng * ry
  const n = -sinLat * cosLng * rx - sinLat * sinLng * ry + cosLat * rz
  const u = cosLat * cosLng * rx + cosLat * sinLng * ry + sinLat * rz
  let az = Math.atan2(e, n) * DEG
  if (az < 0) az += 360
  const el = Math.atan2(u, Math.hypot(e, n)) * DEG
  // line-of-sight distance to the craft — the magnitude of the observer→sat
  // vector (ENU is a pure rotation of it, so its length is the slant range)
  const rangeKm = Math.hypot(rx, ry, rz)
  return { azimuthDeg: az, elevationDeg: el, rangeKm }
}

/** Shortest signed difference a−b folded into (−180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = ((a - b + 180) % 360) - 180
  if (d <= -180) d += 360
  return d
}

interface ScreenPos {
  x: number
  y: number
  /** Inside the phone's field of view (and above the horizon)? */
  visible: boolean
}

/** Project a satellite's (azimuth, elevation) onto the screen given where the
 * phone points (heading + pitch) and its field of view. A flat gnomonic-ish
 * mapping: good enough that markers track the real sky as you pan the phone. */
export function projectToView(
  // only the angles matter for the screen mapping — range is carried elsewhere
  sat: Pick<LookAngles, 'azimuthDeg' | 'elevationDeg'>,
  device: { headingDeg: number; pitchDeg: number },
  view: { width: number; height: number; hFovDeg: number; vFovDeg: number },
): ScreenPos {
  const dAz = angleDelta(sat.azimuthDeg, device.headingDeg)
  const dEl = sat.elevationDeg - device.pitchDeg
  const x = view.width / 2 + (dAz / (view.hFovDeg / 2)) * (view.width / 2)
  const y = view.height / 2 - (dEl / (view.vFovDeg / 2)) * (view.height / 2)
  const visible =
    sat.elevationDeg > 0 && Math.abs(dAz) <= view.hFovDeg / 2 && Math.abs(dEl) <= view.vFovDeg / 2
  return { x, y, visible }
}
