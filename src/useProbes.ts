/** Load the baked probe trajectories once for React — the nav list and the info
 * panel's live distance. The 3D layer (probesLayer) loads the same snapshot
 * separately for rendering; the browser caches it, so it's one fetch in effect. */

import { useEffect, useState } from 'react'
import { earthSatTrajectories, type ProbeTraj } from './lib/probes'

export function useProbes(): ProbeTraj[] {
  // GOES ride along with Earth — always listed, even if the snapshot is offline.
  const [trajs, setTrajs] = useState<ProbeTraj[]>(() => earthSatTrajectories())
  useEffect(() => {
    let cancelled = false
    fetch('probes/probes.json')
      .then((r) => (r.ok ? (r.json() as Promise<ProbeTraj[]>) : Promise.reject(new Error('no probes'))))
      .then((data) => {
        if (!cancelled) setTrajs([...data, ...earthSatTrajectories()])
      })
      .catch(() => {
        // offline / no snapshot → the nav still lists the Earth-orbiting craft
      })
    return () => {
      cancelled = true
    }
  }, [])
  return trajs
}
