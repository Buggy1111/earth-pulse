/** Right-side navigator for Solar System mode: the Sun and every planet as a
 * tree, planets expand to their moons — one click glides the camera there.
 * Doubles as a targeting console: each body shows its live range from Earth,
 * ticking with the simulated clock, and the focused body reads out as the
 * locked target. */

import { useState } from 'react'
import { PLANET_MOONS, PLANETS, planetPositions } from '../../lib/planets'
import { ACTIVE_SPACECRAFT_COUNT, SOLAR_SYSTEM_SPACECRAFT } from '../../lib/spacecraft'
import { PROBE_INFO, type ProbeTraj } from '../../lib/probes'

/** "Sun: 3 · Moon: 11 · Mars: 8 …" for the spacecraft-count tooltip. */
const SPACECRAFT_BREAKDOWN = Object.entries(
  SOLAR_SYSTEM_SPACECRAFT.reduce<Record<string, number>>((acc, s) => {
    acc[s.region] = (acc[s.region] ?? 0) + 1
    return acc
  }, {}),
)
  .map(([region, n]) => `${region}: ${n}`)
  .join('  ·  ')

const BODY_COLORS: Record<string, string> = {
  sun: '#ffd27a',
  mercury: '#9aa3ae',
  venus: '#e8c47a',
  earth: '#38bdf8',
  mars: '#e07a5f',
  jupiter: '#d9b38c',
  saturn: '#d8c9a3',
  uranus: '#9fd3dd',
  neptune: '#6f8fd8',
  pluto: '#c9b29b',
}

/** Tree rows: the Sun, then each planet (Earth included, in true order). */
const TREE: { id: string; name: string }[] = [
  { id: 'sun', name: 'Sun' },
  { id: 'mercury', name: 'Mercury' },
  { id: 'venus', name: 'Venus' },
  { id: 'earth', name: 'Earth' },
  ...PLANETS.filter((p) => !['mercury', 'venus'].includes(p.id)).map((p) => ({
    id: p.id,
    name: p.name,
  })),
]

/** Every body's display name, for the locked-target read-out. */
const NAME: Record<string, string> = {
  ...Object.fromEntries(TREE.map((t) => [t.id, t.name])),
  ...Object.fromEntries(Object.values(PLANET_MOONS).flat().map((m) => [m.id, m.name])),
  ...Object.fromEntries(Object.values(PROBE_INFO).map((p) => [p.id, p.name])),
}

const fmtAu = (au: number) => `${au.toFixed(au < 10 ? 2 : 1)} AU`

export function SolarNavTree({
  focus,
  now,
  probes,
  onNavigate,
  onOverview,
}: {
  focus: string | null
  /** Simulated clock — drives the live range read-outs. */
  now: number
  /** Deep-space probes currently in the scene (clickable to fly to). */
  probes: ProbeTraj[]
  onNavigate: (id: string) => void
  onOverview: () => void
}) {
  const [opened, setOpened] = useState<Set<string>>(new Set())
  // live distance from Earth, AU, for every planet at the current sim time
  const range = new Map(planetPositions(new Date(now)).map((p) => [p.id, p.distEarthAu]))
  const rangeOf = (id: string) =>
    id === 'earth' ? 'home' : id === 'sun' ? '1.0 AU' : range.has(id) ? fmtAu(range.get(id)!) : null

  // the focused body's system stays expanded even without a manual toggle
  const focusParent =
    focus &&
    (TREE.some((t) => t.id === focus)
      ? focus
      : Object.entries(PLANET_MOONS).find(([, ms]) => ms.some((m) => m.id === focus))?.[0])
  const isOpen = (id: string) => opened.has(id) || id === focusParent

  const toggle = (id: string) =>
    setOpened((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="hud fade-up pointer-events-auto w-72 px-4 py-3">
      <h2 className="flex items-center justify-between text-xs font-semibold tracking-wide text-slate-400 uppercase">
        🧭 Navigator
        <button
          type="button"
          onClick={onOverview}
          className="cursor-pointer text-xs text-violet-300 normal-case hover:text-violet-200"
        >
          ⊙ overview
        </button>
      </h2>

      {/* locked-target read-out — the console's “what am I looking at” line */}
      <div className="num mt-1 flex items-baseline justify-between border-b border-white/10 pb-1.5 text-[11px] tracking-wide text-slate-400 uppercase">
        <span>
          ▸ target{' '}
          <span className="text-cyan-300">{focus ? (NAME[focus] ?? focus) : 'none'}</span>
        </span>
        {focus && rangeOf(focus) && rangeOf(focus) !== 'home' && (
          <span className="text-slate-300">{rangeOf(focus)}</span>
        )}
      </div>

      <ul className="mt-1.5 max-h-[52vh] overflow-y-auto pr-1">
        {TREE.map((body) => {
          const moons = PLANET_MOONS[body.id] ?? []
          const open = isOpen(body.id)
          const active = focus === body.id
          const r = rangeOf(body.id)
          return (
            <li key={body.id}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onNavigate(body.id)}
                  title={`fly to ${body.name}`}
                  className={`flex flex-1 cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs transition-colors ${
                    active
                      ? 'bg-cyan-400/12 text-cyan-100 shadow-[inset_2px_0_0_#22d3ee]'
                      : 'text-slate-300 hover:bg-white/10 hover:text-slate-100'
                  }`}
                >
                  <span className="w-2 shrink-0 text-[10px] text-cyan-300">{active ? '▸' : ''}</span>
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: BODY_COLORS[body.id], boxShadow: active ? `0 0 6px ${BODY_COLORS[body.id]}` : undefined }}
                  />
                  <span className="flex-1 truncate">{body.name}</span>
                  {r && (
                    <span className={`num text-[11px] ${active ? 'text-cyan-200' : 'text-slate-400'}`}>{r}</span>
                  )}
                </button>
                {moons.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggle(body.id)}
                    aria-expanded={open}
                    title={`${moons.length} moons`}
                    className="cursor-pointer rounded px-1 py-0.5 text-[10px] text-slate-500 hover:bg-white/10 hover:text-slate-300"
                  >
                    {moons.length} {open ? '▾' : '▸'}
                  </button>
                )}
              </div>
              {open &&
                moons.map((m) => {
                  const ma = focus === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onNavigate(m.id)}
                      title={`fly to ${m.name}`}
                      className={`ml-4 flex w-[calc(100%-1rem)] cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-[11px] transition-colors ${
                        ma
                          ? 'bg-cyan-400/12 text-cyan-100 shadow-[inset_2px_0_0_#22d3ee]'
                          : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                      }`}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: m.color, boxShadow: ma ? `0 0 6px ${m.color}` : undefined }}
                      />
                      <span className="flex-1 truncate">{m.name}</span>
                    </button>
                  )
                })}
            </li>
          )
        })}
      </ul>

      {/* 🛰 deep-space probes — click a name to fly out and orbit the craft */}
      {probes.length > 0 && (
        <div className="mt-2 border-t border-white/10 pt-1.5">
          <div className="px-1.5 pb-1 text-[10px] tracking-wide text-slate-500 uppercase">
            🛰 Deep-space probes
          </div>
          {probes.map((pr) => {
            const info = PROBE_INFO[pr.id]
            const active = focus === pr.id
            return (
              <button
                key={pr.id}
                type="button"
                onClick={() => onNavigate(pr.id)}
                title={`fly to ${info?.name ?? pr.name}`}
                className={`flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs transition-colors ${
                  active
                    ? 'bg-cyan-400/12 text-cyan-100 shadow-[inset_2px_0_0_#22d3ee]'
                    : 'text-slate-300 hover:bg-white/10 hover:text-slate-100'
                }`}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: info?.color ?? '#cbd5e1', boxShadow: active ? `0 0 6px ${info?.color}` : undefined }}
                />
                <span className="flex-1 truncate">{info?.name ?? pr.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 🛰 how many robotic explorers are out there across the system right now */}
      <div
        className="num mt-2 border-t border-white/10 pt-2 text-[10px] leading-tight text-slate-500"
        title={SPACECRAFT_BREAKDOWN}
      >
        🛰 <span className="text-slate-300">{ACTIVE_SPACECRAFT_COUNT}</span> active spacecraft
        exploring the solar system right now
      </div>
    </div>
  )
}
