/** A persisted manual heading/pitch offset for the Sky AR overlay. Phone
 * magnetometers carry a bias (and don't know the local magnetic declination),
 * and camera fields of view vary by device — so rather than guess a correction,
 * we let the user nudge the whole sky until a known object (the Moon) lines up,
 * and remember it. The ref mirrors the state so the per-frame projection loop
 * can read the latest offset without re-subscribing every nudge. */

import { useEffect, useRef, useState } from 'react'

const KEY = 'earth-pulse-ar-calib'

export interface Calib {
  /** Degrees added to the compass heading. */
  heading: number
  /** Degrees added to the tilt. */
  pitch: number
}

function load(): Calib {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && typeof v.heading === 'number' && typeof v.pitch === 'number') return v
  } catch {
    // bad/absent value — start uncalibrated
  }
  return { heading: 0, pitch: 0 }
}

export function useArCalibration() {
  const [calib, setCalib] = useState<Calib>(load)
  const calibRef = useRef(calib)
  useEffect(() => {
    calibRef.current = calib
    try {
      localStorage.setItem(KEY, JSON.stringify(calib))
    } catch {
      // storage unavailable (private mode) — the offset just won't persist
    }
  }, [calib])
  const nudge = (dHeading: number, dPitch: number) =>
    setCalib((c) => ({ heading: c.heading + dHeading, pitch: c.pitch + dPitch }))
  const reset = () => setCalib({ heading: 0, pitch: 0 })
  return { calib, calibRef, nudge, reset }
}
