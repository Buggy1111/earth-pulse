import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { deviceTier } from './deviceTier'

describe('deviceTier', () => {
  const orig = { ...navigator }

  beforeEach(() => {
    vi.stubGlobal('navigator', { ...orig, hardwareConcurrency: 8, deviceMemory: 8 })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('full constellation on strong devices', () => {
    const t = deviceTier()
    expect(t.satLimit).toBe(Infinity)
    expect(t.lowPower).toBe(false)
  })

  it('limited sats on mid devices', () => {
    vi.stubGlobal('navigator', { ...orig, hardwareConcurrency: 6, deviceMemory: 4 })
    const t = deviceTier()
    expect(t.satLimit).toBe(400)
    expect(t.lowPower).toBe(false)
  })

  it('low tier: 120 sats + no model pool', () => {
    vi.stubGlobal('navigator', { ...orig, hardwareConcurrency: 4, deviceMemory: 2 })
    const t = deviceTier()
    expect(t.satLimit).toBe(120)
    expect(t.lowPower).toBe(true)
  })

  it('defaults are conservative when APIs are missing', () => {
    vi.stubGlobal('navigator', { ...orig })
    const t = deviceTier()
    // unknown device → lowest band (protect against the OOM crash we cannot
    // predict), never Infinity
    expect(t.satLimit).toBe(120)
    expect(t.lowPower).toBe(true)
  })
})
