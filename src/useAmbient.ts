/** App-level hook for the ambient planet drone (see lib/ambient). */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { planetActivity, startDrone, type Drone } from './lib/ambient'
import { getAudioContext, unlockAudio } from './lib/audioCtx'
import type { Quake } from './lib/quakes'

/** 🎧 Optional ambient drone whose mood follows the planet's activity (recent
 * quakes + the Kp index). Off by default; the click that turns it on unlocks the
 * shared AudioContext (browser autoplay policy). */
export function useAmbient(quakes: Quake[], kp: number | null, now: number) {
  const [ambientOn, setAmbientOn] = useState(false)
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
    const drone = startDrone(getAudioContext(), activityRef.current)
    droneRef.current = drone
    return () => {
      drone.stop()
      droneRef.current = null
    }
  }, [ambientOn])

  useEffect(() => {
    droneRef.current?.setActivity(activity, 8)
  }, [activity])

  const toggleAmbient = useCallback(() => {
    // unlock in the click itself — a context created later (in an effect) stays
    // suspended on iOS Safari and the drone would be silent while showing "on"
    if (!ambientOn) unlockAudio()
    setAmbientOn(!ambientOn)
  }, [ambientOn])
  return { ambientOn, toggleAmbient, activity }
}
