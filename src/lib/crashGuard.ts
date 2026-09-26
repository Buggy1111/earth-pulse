/** Repeated-crash detection for mobile.
 *
 * When the app boots, we count the boot; a healthy 15 s on screen clears it.
 * If the renderer process is killed (Android Chrome "S tímto procesem došlo k
 * opakovaným problémům") the counter survives in localStorage, so the NEXT
 * load sees 1–2 unclean boots and can self-demote to a lite configuration
 * (2K textures, eco rendering) before the globe even mounts — breaking the
 * crash loop instead of re-crashing on the same heavy setup. */

const KEY = 'ep-unclean-boots'
const HEALTHY_MS = 15_000
/** Boots seen without a healthy stretch before we demote to lite. */
export const CRASH_DEMOTE_AFTER = 2

export function uncleanBoots(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0)
  } catch {
    return 0
  }
}

/** Call once at module load on boot: increments the counter, arms a timer that
 * clears it after HEALTHY_MS. Returns how many unclean boots preceded this one. */
export function markBoot(): number {
  let n = uncleanBoots()
  try {
    localStorage.setItem(KEY, String(n + 1))
  } catch {
    /* private mode — detection simply stays off */
  }
  window.setTimeout(() => {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }, HEALTHY_MS)
  return n
}