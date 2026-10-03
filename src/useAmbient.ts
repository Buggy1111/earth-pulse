/** App-level hook for the ambient planet drone (see lib/ambient). */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { planetActivity, startDrone, type Drone } from './lib/ambient'
import type { Quake } from './lib/quakes'

/** 🎧 Optional ambient drone whose mood follows the planet's activity (recent
 * quakes + the Kp index). Off by default; the click that turns it on also
 * satisfies the browser's autoplay policy. */
export function useAmbient(quakes: Quake[], kp: number | null, now: number) {
  const [ambientOn, setAmbientOn] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const droneRef = useRef<Drone | null>(null)
  const activityRef = useRef(0)
  // re-evaluated each minute so a fresh quake nudges the mood without per-frame work
  const minute = Math.floor(now / 60_000)
  const activity = useMemo(() => planetActivity({ quakes, kp, now: minute * 60_000 }), [quakes, kp, minute])
  useEffect(() => {
    activityRef.current = activity
  }, [activity])

  useEffect(() => {
    if (!ambientOn) return
    const ctx = (ctxRef.current ??= new AudioContext())
    void ctx.resume()
    const drone = startDrone(ctx, activityRef.current)
    droneRef.current = drone
    return () => {
      drone.stop()
      droneRef.current = null
    }
  }, [ambientOn])

  useEffect(() => {
    droneRef.current?.setActivity(activity, 8)
  }, [activity])

  // close the audio context with the page
  useEffect(
    () => () => {
      void ctxRef.current?.close()
    },
    [],
  )

  const toggleAmbient = useCallback(() => setAmbientOn((on) => !on), [])
  return { ambientOn, toggleAmbient, activity }
}
