/** 🎧 Ambient planet drone: a slow synth bed whose mood follows the planet's
 * activity — calm and open (a perfect fifth, bright and slow) when the Earth is
 * quiet; dark, beating and dissonant when it shakes or the magnetosphere storms.
 *
 * The mapping (activity → sound parameters) is pure and unit-tested; `startDrone`
 * is the thin Web Audio part. Default OFF, behind a 🎧 toggle (autoplay policy
 * needs the click anyway). */

import type { Quake } from './quakes'

const HOUR = 3_600_000

/** 0 (dead calm) … 1 (planet in distress) from recent quakes and the Kp index. */
export function planetActivity({ quakes, kp, now }: { quakes: Quake[]; kp: number | null; now: number }): number {
  // quake energy scales ~10^(1.5·M); weigh the last 6 h, fresher ones heavier
  let energy = 0
  let strongest = 0
  for (const q of quakes) {
    const ageH = (now - q.time) / HOUR
    if (ageH < 0 || ageH > 6) continue
    const w = 1 - ageH / 6 / 2 // 1 → 0.5 across the window
    energy += w * Math.pow(10, 1.5 * (Math.min(q.mag, 9.5) - 4))
    strongest = Math.max(strongest, q.mag)
  }
  // a typical busy day (a handful of M4s + a M5) lands near 0.3; an M7 saturates it
  const quakeScore = 1 - Math.exp(-energy / 25)
  const bigScore = Math.max(0, Math.min(1, (strongest - 5) / 2.5)) // M5 → 0, M7.5+ → 1
  const kpScore = kp === null ? 0 : Math.max(0, Math.min(1, (kp - 3) / 5)) // Kp 3 → 0, Kp 8 → 1
  return Math.max(0, Math.min(1, Math.max(quakeScore * 0.7, bigScore, kpScore * 0.8)))
}

export interface DroneParams {
  /** Root note, Hz. */
  rootHz: number
  /** Second voice as a ratio of the root: 3/2 (open fifth) → tritone → minor second. */
  ratio: number
  /** Low-pass cutoff, Hz — closes (darker) as tension rises. */
  cutoffHz: number
  /** Tremolo speed, Hz, and depth 0–1. */
  lfoHz: number
  lfoDepth: number
  /** Master gain. */
  gain: number
  /** Third voice (sub octave) level 0–1. */
  subLevel: number
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function droneParams(activity: number): DroneParams {
  const a = Math.max(0, Math.min(1, activity))
  // consonance falls off in two stages: fifth → tritone (a < .6), then → minor 2nd
  const ratio = a < 0.6 ? lerp(1.5, Math.SQRT2, a / 0.6) : lerp(Math.SQRT2, 1.0595, (a - 0.6) / 0.4)
  return {
    rootHz: lerp(55, 49, a), // A1 sinking toward G1
    ratio,
    cutoffHz: lerp(1400, 320, a),
    lfoHz: lerp(0.07, 2.4, a * a),
    lfoDepth: lerp(0.08, 0.45, a),
    gain: lerp(0.07, 0.16, a),
    subLevel: lerp(0.35, 0.8, a),
  }
}

export interface Drone {
  /** Glide to a new activity level over `seconds`. */
  setActivity(activity: number, seconds?: number): void
  stop(): void
}

/** Glide a parameter from wherever it is NOW to `value` — an unanchored
 * linearRamp would start from the previous scheduled event and click. */
function glide(param: AudioParam, value: number, now: number, end: number): void {
  param.cancelScheduledValues(now)
  param.setValueAtTime(param.value, now)
  param.linearRampToValueAtTime(value, end)
}

export function startDrone(ctx: AudioContext, activity: number): Drone {
  const p = droneParams(activity)
  const t = ctx.currentTime
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, t)
  master.gain.exponentialRampToValueAtTime(p.gain, t + 4) // slow fade-in

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.7
  filter.frequency.value = p.cutoffHz

  const trem = ctx.createGain()
  trem.gain.value = 1 - p.lfoDepth / 2
  const lfo = ctx.createOscillator()
  const lfoAmt = ctx.createGain()
  lfo.frequency.value = p.lfoHz
  lfoAmt.gain.value = p.lfoDepth / 2
  lfo.connect(lfoAmt).connect(trem.gain)

  const root = ctx.createOscillator()
  root.type = 'sawtooth'
  root.frequency.value = p.rootHz
  const second = ctx.createOscillator()
  second.type = 'triangle'
  second.frequency.value = p.rootHz * p.ratio
  const sub = ctx.createOscillator()
  sub.type = 'sine'
  sub.frequency.value = p.rootHz / 2
  const subGain = ctx.createGain()
  subGain.gain.value = p.subLevel
  const rootGain = ctx.createGain()
  rootGain.gain.value = 0.5

  root.connect(rootGain).connect(filter)
  second.connect(filter)
  sub.connect(subGain).connect(filter)
  filter.connect(trem).connect(master).connect(ctx.destination)
  for (const o of [root, second, sub, lfo]) o.start(t)

  return {
    setActivity(next, seconds = 6) {
      const q = droneParams(next)
      const now = ctx.currentTime
      const end = now + seconds
      glide(root.frequency, q.rootHz, now, end)
      glide(second.frequency, q.rootHz * q.ratio, now, end)
      glide(sub.frequency, q.rootHz / 2, now, end)
      glide(filter.frequency, q.cutoffHz, now, end)
      glide(lfo.frequency, q.lfoHz, now, end)
      glide(lfoAmt.gain, q.lfoDepth / 2, now, end)
      glide(trem.gain, 1 - q.lfoDepth / 2, now, end)
      glide(subGain.gain, q.subLevel, now, end)
      glide(master.gain, q.gain, now, end)
    },
    stop() {
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now)
      master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)
      for (const o of [root, second, sub, lfo]) o.stop(now + 1.3)
      setTimeout(() => master.disconnect(), 1500)
    },
  }
}
