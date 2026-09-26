import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { uncleanBoots, markBoot, CRASH_DEMOTE_AFTER } from './crashGuard'

describe('crashGuard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at zero unclean boots', () => {
    expect(uncleanBoots()).toBe(0)
    expect(markBoot()).toBe(0)
  })

  it('counts consecutive unclean boots', () => {
    markBoot()
    expect(markBoot()).toBe(1)
    expect(markBoot()).toBe(2)
    expect(uncleanBoots()).toBe(3)
  })

  it('clears the counter after a healthy stretch', () => {
    markBoot()
    markBoot()
    vi.advanceTimersByTime(15_000 + 1)
    expect(uncleanBoots()).toBe(0)
  })

  it('exposes the demote threshold', () => {
    expect(CRASH_DEMOTE_AFTER).toBe(2)
  })
})