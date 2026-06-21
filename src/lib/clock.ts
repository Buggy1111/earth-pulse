/** The one warped simulation clock. Sim time runs `warp`× faster than real time
 * from the last anchor (realMs → simMs); everything physical (sun, moon,
 * satellites, probes) reads from this single source so the whole scene stays in
 * lockstep. Centralised here so the load-bearing time expression lives in exactly
 * one place. `nowMs` is the caller's current time — `Date.now()` inside a frame
 * loop, or the polled `now` for a reactive render value; `offsetMs` is the
 * timeline-scrub offset (0 when not scrubbing). */
export interface WarpClock {
  realMs: number
  simMs: number
  warp: number
}

export function warpedSimMs(clock: WarpClock, nowMs: number, offsetMs = 0): number {
  return clock.simMs + (nowMs - clock.realMs) * clock.warp + offsetMs
}
