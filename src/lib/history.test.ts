import { describe, expect, it } from 'vitest'
import { HISTORIC_EVENTS, historyUpTo, yearOf } from './history'
import { EVENT_META } from './events'

describe('history of the planet', () => {
  it('is chronological with unique ids and valid coordinates', () => {
    const ids = new Set(HISTORIC_EVENTS.map((e) => e.id))
    expect(ids.size).toBe(HISTORIC_EVENTS.length)
    for (let i = 1; i < HISTORIC_EVENTS.length; i++) {
      expect(HISTORIC_EVENTS[i].date).toBeGreaterThanOrEqual(HISTORIC_EVENTS[i - 1].date)
    }
    for (const e of HISTORIC_EVENTS) {
      expect(Math.abs(e.lat)).toBeLessThanOrEqual(90)
      expect(Math.abs(e.lng)).toBeLessThanOrEqual(180)
      expect(e.historic).toBe(true)
      expect(e.note?.length).toBeGreaterThan(20)
      expect(EVENT_META[e.category], `${e.title}: unknown category ${e.category}`).toBeDefined()
    }
  })

  it('keeps the year-79 eruption in AD 79, not 1979', () => {
    expect(yearOf(HISTORIC_EVENTS[0])).toBe(79)
    expect(HISTORIC_EVENTS[0].title).toMatch(/Vesuvius/)
  })

  it('slices the chronology safely', () => {
    expect(historyUpTo(0)).toEqual([])
    expect(historyUpTo(3)).toHaveLength(3)
    expect(historyUpTo(999)).toHaveLength(HISTORIC_EVENTS.length)
    expect(historyUpTo(-5)).toEqual([])
    expect(historyUpTo(2.9)).toHaveLength(2)
  })
})
