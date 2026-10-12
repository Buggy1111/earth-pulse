/** One shared AudioContext for the whole page (quake ping 🔔 + ambient drone 🎧).
 * Browsers cap how many contexts a page may hold and each one costs an audio
 * thread on mobile, so both features borrow this one. */

let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  ctx ??= new AudioContext()
  return ctx
}

/** Call INSIDE a click/tap handler: creating + resuming during the user gesture is
 * what satisfies the autoplay policy (iOS Safari ignores a resume() made later). */
export function unlockAudio(): AudioContext {
  const c = getAudioContext()
  void c.resume()
  return c
}
