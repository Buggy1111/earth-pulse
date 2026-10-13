import { describe, expect, it } from 'vitest'
import { isIssTelemetryFresh, ISS_MAX_AGE_MS, parseIss } from './iss'

describe('ISS telemetry freshness', () => {
  it('shows recent telemetry but rejects stale, missing and future readings', () => {
    const now = Date.UTC(2026, 9, 12, 12)
    expect(isIssTelemetryFresh(now - 5_000, now)).toBe(true)
    expect(isIssTelemetryFresh(now - ISS_MAX_AGE_MS, now)).toBe(true)
    expect(isIssTelemetryFresh(now - ISS_MAX_AGE_MS - 1, now)).toBe(false)
    expect(isIssTelemetryFresh(0, now)).toBe(false)
    expect(isIssTelemetryFresh(now + 1000, now)).toBe(false)
  })

  it('rejects invalid coordinates', () => {
    expect(parseIss({ latitude: NaN, longitude: 15 })).toBeNull()
    expect(parseIss({ latitude: 91, longitude: 15 })).toBeNull()
    expect(parseIss({ latitude: 45, longitude: -181 })).toBeNull()
    expect(parseIss({ latitude: -90, longitude: 180 })?.lat).toBe(-90)
    expect(parseIss({ latitude: 50, longitude: 15 })?.lat).toBe(50)
  })
})
