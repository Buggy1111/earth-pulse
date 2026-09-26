/** Device capability probe — how many heavy objects this phone can take.
 *
 * UA sniffing alone misclassifies (a 2026 mid-range Android is a beast next to
 * a 2020 tablet with the same UA). What actually predicts the Earth Pulse OOM
 * crash is total memory + renderer cores, so score those. Unknown values fall
 * back to the LOWEST band, because the failure mode we are protecting against
 * is Android Chrome OOM-killing the tab — a cautious default costs a smaller
 * swarm, a greedy one costs the whole session.
 */

export interface DeviceTier {
  /** Starlink instances the swarm may build. Infinity = full constellation. */
  satLimit: number
  /** Whether to skip the GLB model pool entirely (panels only). */
  lowPower: boolean
}

export function deviceTier(): DeviceTier {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 2 // unknown → assume weak
  const mem = nav.deviceMemory ?? 1 // GB, Chrome-only; unknown → assume weak

  // Low: ≤2 GB RAM or ≤4 cores (or unknown) — 120 sats, panels only.
  // Mid: ≤4 GB — 400 sats. Real phones rarely exceed this. Desktop: everything.
  if (mem <= 2 || cores <= 4) return { satLimit: 120, lowPower: true }
  if (mem <= 4 || cores <= 6) return { satLimit: 400, lowPower: false }
  return { satLimit: Infinity, lowPower: false }
}
