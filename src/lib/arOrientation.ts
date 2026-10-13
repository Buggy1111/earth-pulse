/** Normalize untrusted phone orientation readings before driving the AR camera. */
export function safeArOrientation(
  alpha: number | null,
  beta: number | null,
  compass: number | null,
  previous: { heading: number; pitch: number },
): { heading: number; pitch: number; valid: boolean } {
  const good = (v: number | null): v is number => typeof v === 'number' && Number.isFinite(v)
  const hasHeading = good(compass) || good(alpha)
  const hasPitch = good(beta)
  if (!hasHeading && !hasPitch) return { ...previous, valid: false }
  const rawHeading = good(compass) ? compass : good(alpha) ? 360 - alpha : previous.heading
  const heading = ((rawHeading % 360) + 360) % 360
  const pitch = hasPitch ? Math.max(-90, Math.min(90, beta - 90)) : previous.pitch
  return { heading, pitch, valid: true }
}
