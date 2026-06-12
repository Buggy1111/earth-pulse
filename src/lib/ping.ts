/** Web Audio ping for newly detected earthquakes (default OFF, 🔔 toggle).
 *
 * Pitch falls and loudness rises with magnitude, like a bigger bell.
 * The mapping is pure and unit-tested; `playPing` is the thin DOM part.
 */

/** Sine pitch in Hz: M0 ≈ 880 down to M8+ ≈ 110. */
export function pingFrequency(mag: number): number {
  const m = Math.min(Math.max(mag, 0), 8)
  return 880 * Math.pow(2, -m * 0.375)
}

/** Peak gain 0.05–0.5, growing with magnitude. */
export function pingGain(mag: number): number {
  const m = Math.min(Math.max(mag, 0), 8)
  return 0.05 + (m / 8) * 0.45
}

/** Ring duration in seconds — big quakes ring longer. */
export function pingDuration(mag: number): number {
  const m = Math.min(Math.max(mag, 0), 8)
  return 0.4 + m * 0.15
}

export function playPing(ctx: AudioContext, mag: number): void {
  const t = ctx.currentTime
  const duration = pingDuration(mag)
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(pingFrequency(mag), t)
  gain.gain.setValueAtTime(pingGain(mag), t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t)
  osc.stop(t + duration)
}
