/** Info panel for Solar System mode — overview facts or the picked body,
 * faithful encyclopedic data: spin, year, tilt, temperature, moons. */

import { PLANET_MOONS, PLANETS, planetPositions } from '../lib/planets'

const AU_KM = 149_597_870

function fmtRotation(h: number): string {
  const abs = Math.abs(h)
  const retro = h < 0 ? ' (retrograde!)' : ''
  return abs >= 48 ? `${(abs / 24).toFixed(1)} days${retro}` : `${abs.toFixed(1)} h${retro}`
}

function fmtYear(d: number): string {
  return d >= 700 ? `${(d / 365.25).toFixed(1)} years` : `${Math.round(d)} days`
}

const WARPS: { label: string; factor: number }[] = [
  { label: 'live', factor: 1 },
  { label: '1 h/s', factor: 3_600 },
  { label: '1 d/s', factor: 86_400 },
  { label: '1 w/s', factor: 604_800 },
]

/** One-click navigation: every body in the scene, camera glides to it. */
const NAV: { id: string; label: string; color: string }[] = [
  { id: 'sun', label: 'Sun', color: '#ffd27a' },
  { id: 'mercury', label: 'Mercury', color: '#9aa3ae' },
  { id: 'venus', label: 'Venus', color: '#e8c47a' },
  { id: 'earth', label: 'Earth', color: '#38bdf8' },
  { id: 'mars', label: 'Mars', color: '#e07a5f' },
  { id: 'jupiter', label: 'Jupiter', color: '#d9b38c' },
  { id: 'saturn', label: 'Saturn', color: '#d8c9a3' },
  { id: 'uranus', label: 'Uranus', color: '#9fd3dd' },
  { id: 'neptune', label: 'Neptune', color: '#6f8fd8' },
  { id: 'pluto', label: 'Pluto', color: '#c9b29b' },
]

export function PlanetPanel({
  focus,
  now,
  realNow,
  warp,
  onWarp,
  onWarpReset,
  onOverview,
  onNavigate,
  onBack,
}: {
  /** Planet id, 'sun', 'earth', or null for the system overview. */
  focus: string | null
  /** Simulated time (warped). */
  now: number
  /** Real wall-clock time, for the "are we off the live moment" check. */
  realNow: number
  warp: number
  onWarp: (factor: number) => void
  onWarpReset: () => void
  onOverview: () => void
  /** Fly the camera to a body picked in the navigation strip. */
  onNavigate: (id: string) => void
  onBack: () => void
}) {
  const warped = warp !== 1 || Math.abs(now - realNow) > 120_000
  const positions = planetPositions(new Date(now))
  const p = focus && focus !== 'sun' ? positions.find((x) => x.id === focus) : null
  const def = p ? PLANETS.find((x) => x.id === p.id) : null
  const moons = p ? (PLANET_MOONS[p.id] ?? []) : []
  return (
    <div className="hud pointer-events-auto w-72 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
          🪐{' '}
          {focus === 'sun'
            ? 'The Sun'
            : focus === 'earth'
              ? 'Earth'
              : (p?.name ?? 'Solar system · live')}
        </h2>
        <div className="flex gap-2">
          {focus && (
            <button
              type="button"
              onClick={onOverview}
              className="cursor-pointer text-xs text-violet-300 hover:text-violet-200"
            >
              ⊙ overview
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer text-xs text-sky-300 hover:text-sky-200"
          >
            ← Earth
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-1 gap-y-0.5 border-b border-white/10 pb-2">
        {NAV.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onNavigate(b.id)}
            title={`fly to ${b.label}`}
            className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${
              focus === b.id
                ? 'bg-white/15 text-slate-100'
                : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
            }`}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: b.color }}
            />
            {b.label}
          </button>
        ))}
      </div>
      {p && def ? (
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-400">
          <span className="num">
            ☀️ {p.distSunAu.toFixed(2)} AU from the Sun · 🌍 {p.distEarthAu.toFixed(2)} AU (
            {Math.round((p.distEarthAu * AU_KM) / 1e6).toLocaleString('en-US')} mil. km) from Earth
          </span>
          <span className="num">
            ⌀ {def.diameterKm.toLocaleString('en-US')} km · tilt {def.facts.tiltDeg}° · ~
            {def.facts.tempC} °C
          </span>
          <span className="num">
            🔄 day: {fmtRotation(def.facts.rotationH)} · 🗓 year: {fmtYear(def.facts.yearDays)}
          </span>
          <span>☁️ {def.facts.atmosphere}</span>
          <span className="text-slate-300">✨ {def.facts.fact}</span>
          {def.facts.moonCount > 0 && (
            <div className="mt-1 border-t border-white/10 pt-1">
              <span className="text-[10px] tracking-wide text-slate-500 uppercase">
                Moons ({def.facts.moonCount} known{moons.length > 0 ? `, ${moons.length} shown` : ''})
              </span>
              {moons.map((m) => (
                <p key={m.name} className="mt-0.5 text-xs">
                  <span className="text-slate-200">{m.name}</span>{' '}
                  <span className="num text-slate-500">
                    · orbits in {m.periodD < 2 ? `${(m.periodD * 24).toFixed(0)} h` : `${m.periodD.toFixed(1)} d`}
                    {m.retrograde ? ' ↺' : ''}
                  </span>
                  {m.fact && <span className="text-slate-400"> — {m.fact}</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : focus === 'sun' ? (
        <p className="mt-1 text-xs text-slate-400">
          ⌀ 1,392,700 km · 99.86 % of the system's mass · light takes ~8 min to reach Earth
        </p>
      ) : focus === 'earth' ? (
        <p className="mt-1 text-xs text-slate-400">
          🏠 your home, still fully live — satellites, quakes and clouds keep running on the
          mini-globe. Click it to fly back home.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          the Sun and all 8 planets (Pluto included 💙) at their real positions for right
          now, true orbit ellipses, real relative sizes — Earth is the small blue one, still
          live. Click any body to orbit it; click Earth to come home.
        </p>
      )}

      <div className="mt-2 flex items-center gap-1 border-t border-white/10 pt-2">
        <span className="mr-1 text-[10px] tracking-wide text-slate-500 uppercase">⏩ time</span>
        {WARPS.map((w) => (
          <button
            key={w.factor}
            type="button"
            onClick={() => (w.factor === 1 && warped ? onWarpReset() : onWarp(w.factor))}
            className={`cursor-pointer rounded px-1.5 py-0.5 text-[11px] ${
              warp === w.factor
                ? 'bg-violet-500/25 text-violet-200'
                : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
      {warped && (
        <p className="num mt-1 text-xs text-amber-300">
          ⏱{' '}
          {new Date(now).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          <button
            type="button"
            onClick={onWarpReset}
            className="cursor-pointer text-slate-500 underline hover:text-slate-300"
          >
            back to now
          </button>
        </p>
      )}
    </div>
  )
}
