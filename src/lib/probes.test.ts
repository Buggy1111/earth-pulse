import { describe, expect, it } from 'vitest'
import { probePosAu, type ProbeTraj } from './probes'

const traj: ProbeTraj = {
  id: 'x',
  name: 'X',
  jd0: 2461041.5,
  stepDays: 10,
  pos: [0, 0, 0, 10, 0, 0, 20, 0, 0], // 3 samples marching along +X
}

const dateForJd = (jd: number) => new Date((jd - 2440587.5) * 86_400_000)

describe('probePosAu', () => {
  it('returns the exact position at a sample time', () => {
    expect(probePosAu(traj, dateForJd(2461041.5))).toEqual([0, 0, 0])
    expect(probePosAu(traj, dateForJd(2461051.5))).toEqual([10, 0, 0])
  })

  it('linearly interpolates between samples', () => {
    expect(probePosAu(traj, dateForJd(2461046.5))[0]).toBeCloseTo(5, 6) // halfway 0→10
  })

  it('clamps before the first and after the last sample', () => {
    expect(probePosAu(traj, dateForJd(2461000))).toEqual([0, 0, 0]) // before window
    expect(probePosAu(traj, dateForJd(2462000))).toEqual([20, 0, 0]) // past the end
  })
})
