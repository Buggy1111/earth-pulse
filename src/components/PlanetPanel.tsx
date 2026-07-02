/** Info panel for Solar System mode — overview facts or the picked body,
 * faithful encyclopedic data: spin, year, tilt, temperature, moons. */

import { earthHelio, PLANET_MOONS, PLANETS, planetPositions } from '../lib/planets'
import { AU_KM, PROBE_INFO, probePosAu, probeSpeedKms, type ProbeTraj } from '../lib/probes'
import { HudCard } from './hud/HudCard'
import { TimeWarp } from './hud/TimeWarp'

function fmtRotation(h: number): string {
  const abs = Math.abs(h)
  const retro = h < 0 ? ' (retrograde!)' : ''
  return abs >= 48 ? `${(abs / 24).toFixed(1)} days${retro}` : `${abs.toFixed(1)} h${retro}`
}

function fmtYear(d: number): string {
  return d >= 700 ? `${(d / 365.25).toFixed(1)} years` : `${Math.round(d)} days`
}

function fmtKm(km: number): string {
  if (km >= 1e9) return `${(km / 1e9).toFixed(1)} bil. km`
  if (km >= 1e6) return `${Math.round(km / 1e6).toLocaleString('en-US')} mil. km`
  return `${Math.round(km).toLocaleString('en-US')} km`
}

/** Flat moon lookup + its parent's name (moon ids are globally unique). Earth
 * is not in PLANETS (it's the live globe), so fall back to a capitalised id. */
const MOON_INFO = Object.entries(PLANET_MOONS).flatMap(([pid, moons]) =>
  moons.map((m) => ({
    ...m,
    planet: { name: PLANETS.find((p) => p.id === pid)?.name ?? pid[0].toUpperCase() + pid.slice(1) },
  })),
)

export function PlanetPanel({
  focus,
  now,
  realNow,
  warp,
  probes,
  onWarp,
  onWarpReset,
  onOverview,
  onBack,
}: {
  /** Planet/moon/probe id, 'sun', 'earth', or null for the system overview. */
  focus: string | null
  /** Simulated time (warped). */
  now: number
  /** Real wall-clock time, for the "are we off the live moment" check. */
  realNow: number
  warp: number
  /** Baked probe trajectories, for the focused probe's live distance. */
  probes: ProbeTraj[]
  onWarp: (factor: number) => void
  onWarpReset: () => void
  onOverview: () => void
  onBack: () => void
}) {
  const probeInfo = focus ? PROBE_INFO[focus] : undefined
  const probeTraj = focus ? probes.find((t) => t.id === focus) : undefined
  let probeSunAu = 0
  let probeEarthAu = 0
  let probeSpeed = 0
  if (probeTraj) {
    const [px, py, pz] = probePosAu(probeTraj, new Date(now))
    probeSunAu = Math.hypot(px, py, pz)
    const [ex, ey, ez] = earthHelio(new Date(now))
    probeEarthAu = Math.hypot(px - ex, py - ey, pz - ez)
    probeSpeed = probeSpeedKms(probeTraj, new Date(now))
  }
  const positions = planetPositions(new Date(now))
  const p = focus && focus !== 'sun' && !probeInfo ? positions.find((x) => x.id === focus) : null
  const def = p ? PLANETS.find((x) => x.id === p.id) : null
  const moons = p ? (PLANET_MOONS[p.id] ?? []) : []
  const moon = focus && !p && !probeInfo ? MOON_INFO.find((m) => m.id === focus) : null
  return (
    <HudCard className="w-72 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {probeInfo ? '🛰' : moon ? '🌑' : '🪐'}{' '}
          {probeInfo
            ? probeInfo.name
            : focus === 'sun'
              ? 'The Sun'
              : focus === 'earth'
                ? 'Earth'
                : (moon?.name ?? p?.name ?? 'Solar system · live')}
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
      {probeInfo ? (
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-400">
          <span className="num">🛰 {probeInfo.operator} · launched {probeInfo.launched}</span>
          <span className="text-slate-300">✨ {probeInfo.blurb}</span>
          <span className="num">
            🚀 {probeSpeed.toFixed(1)} km/s · ☀️ {probeSunAu.toFixed(2)} AU from the Sun
          </span>
          <span className="num">
            🌍 {probeEarthAu.toFixed(2)} AU from Earth · {fmtKm(probeEarthAu * AU_KM)}
          </span>
          {/* only when the craft really is clamped to the display cap (probesLayer
              MAX_DISPLAY_AU = 200) — a leftover unconditional note claimed even
              Parker at 0.6 AU was "really far out there" */}
          {probeSunAu > 200 && (
            <span className="text-[10px] text-slate-400">drawn at the scene edge — really far out there</span>
          )}
        </div>
      ) : moon ? (
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-400">
          <img
            src={`planets/cards/${moon.id}.webp`}
            alt={`${moon.name} — NASA spacecraft photo`}
            loading="lazy"
            className="mb-1 max-h-36 w-full rounded-lg object-cover"
          />
          <span className="num">
            🪐 moon of {moon.planet.name} · {Math.round(moon.aKkm * 1_000).toLocaleString('en-US')}{' '}
            km out
          </span>
          <span className="num">
            ⌀ {(moon.radiusKm * 2).toLocaleString('en-US')} km · 🔄 orbits in{' '}
            {moon.periodD < 2 ? `${(moon.periodD * 24).toFixed(0)} h` : `${moon.periodD.toFixed(1)} days`}
            {moon.retrograde ? ' ↺ retrograde' : ''}
          </span>
          {moon.discoveredBy && <span>🔭 discovered by {moon.discoveredBy}</span>}
          {moon.fact && <span className="text-slate-300">✨ {moon.fact}</span>}
          <span className="text-[10px] text-slate-400">photo: NASA (public domain)</span>
        </div>
      ) : p && def ? (
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
              <span className="text-[10px] tracking-wide text-slate-400 uppercase">
                Moons ({def.facts.moonCount} known{moons.length > 0 ? `, ${moons.length} shown` : ''})
              </span>
              {moons.map((m) => (
                <p key={m.name} className="mt-0.5 text-xs">
                  <span className="text-slate-200">{m.name}</span>{' '}
                  <span className="num text-slate-400">
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
        <p className="mt-1 text-xs text-slate-400">
          the Sun and all 8 planets (Pluto included 💙) at their real positions for right
          now, true orbit ellipses, real relative sizes — Earth is the small blue one, still
          live. Click any body to orbit it; click Earth to come home.
        </p>
      )}

      <div className="mt-2 border-t border-white/10 pt-2">
        <TimeWarp now={now} realNow={realNow} warp={warp} onWarp={onWarp} onWarpReset={onWarpReset} />
      </div>
    </HudCard>
  )
}
