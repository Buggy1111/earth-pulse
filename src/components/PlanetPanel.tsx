/** Info panel for Solar System mode — overview facts or the picked body,
 * faithful encyclopedic data: spin, year, tilt, temperature, moons. */

import { earthHelio, PLANET_MOONS, PLANETS, planetPositions } from '../lib/planets'
import { AU_KM, PROBE_INFO, probePosAu, probeSpeedKms, type ProbeTraj } from '../lib/probes'
import { HudCard } from './hud/HudCard'
import { TimeWarp } from './hud/TimeWarp'
import { locale, plural, t } from '../lib/i18n'

/** Decimal number in the current language ("1.5" / "1,5"). */
const dec = (n: number, digits = 1) =>
  n.toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })
const int = (n: number) => Math.round(n).toLocaleString(locale())

function fmtRotation(h: number): string {
  const abs = Math.abs(h)
  const retro = h < 0 ? ` (${t('retrograde!')})` : ''
  return abs >= 48 ? `${t('{n} days', { n: dec(abs / 24) })}${retro}` : `${dec(abs)} h${retro}`
}

function fmtYear(d: number): string {
  return d >= 700
    ? t('{n} years', { n: dec(d / 365.25) })
    : `${int(d)} ${plural(Math.round(d), ['day', 'days'], ['den', 'dny', 'dní'])}`
}

/** Light travel time from the Sun (1 AU ≈ 499 light-seconds). */
function fmtLightTime(au: number): string {
  const s = au * 499.005
  return s < 3600 ? `${Math.round(s / 60)} min` : `${dec(s / 3600)} h`
}

/** "You'd weigh…" — a 70 kg person as the relatable anchor. */
function fmtWeight(gravityG: number): string {
  const kg = gravityG * 70
  return kg < 1 ? `${dec(kg, 2)} kg` : `${Math.round(kg)} kg`
}

function fmtKm(km: number): string {
  if (km >= 1e9) return `${dec(km / 1e9)} ${t('bil. km')}`
  if (km >= 1e6) return `${int(km / 1e6)} ${t('mil. km')}`
  return `${int(km)} km`
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
              ? t('The Sun')
              : focus === 'earth'
                ? t('Earth')
                : t(moon?.name ?? p?.name ?? 'Solar system · live')}
        </h2>
        <div className="flex gap-2">
          {focus && (
            <button
              type="button"
              onClick={onOverview}
              className="cursor-pointer text-xs text-violet-300 hover:text-violet-200"
            >
              ⊙ {t('overview')}
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer text-xs text-sky-300 hover:text-sky-200"
          >
            ← {t('Earth')}
          </button>
        </div>
      </div>
      {probeInfo ? (
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-400">
          <span className="num">
            🛰 {probeInfo.operator} · {t('launched {date}', { date: probeInfo.launched })}
          </span>
          <span className="text-slate-300">✨ {t(probeInfo.blurb)}</span>
          <span className="num">
            🚀 {dec(probeSpeed)} km/s · ☀️ {t('{au} AU from the Sun', { au: dec(probeSunAu, 2) })}
          </span>
          <span className="num">
            🌍 {t('{au} AU from Earth', { au: dec(probeEarthAu, 2) })} · {fmtKm(probeEarthAu * AU_KM)}
          </span>
          {/* only when the craft really is clamped to the display cap (probesLayer
              MAX_DISPLAY_AU = 200) — a leftover unconditional note claimed even
              Parker at 0.6 AU was "really far out there" */}
          {probeSunAu > 200 && (
            <span className="text-[10px] text-slate-400">{t('drawn at the scene edge — really far out there')}</span>
          )}
        </div>
      ) : moon ? (
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-400">
          <img
            src={`planets/cards/${moon.id}.webp`}
            alt={`${t(moon.name)} — ${t('NASA spacecraft photo')}`}
            loading="lazy"
            className="mb-1 max-h-36 w-full rounded-lg object-cover"
          />
          <span className="num">
            🪐 {t('moon of {planet}', { planet: t(moon.planet.name) })} · {int(moon.aKkm * 1_000)} {t('km out')}
          </span>
          <span className="num">
            ⌀ {int(moon.radiusKm * 2)} km · 🔄 {t('orbits in')}{' '}
            {moon.periodD < 2 ? `${(moon.periodD * 24).toFixed(0)} h` : t('{n} days', { n: dec(moon.periodD) })}
            {moon.retrograde ? ` ↺ ${t('retrograde')}` : ''}
          </span>
          {moon.gravityG !== undefined && (
            <span className="num">
              🧍 {t('gravity ×{g} — a 70 kg person weighs {w} here', { g: moon.gravityG, w: fmtWeight(moon.gravityG) })}
            </span>
          )}
          {moon.discoveredBy && <span>🔭 {t('discovered by {who}', { who: t(moon.discoveredBy) })}</span>}
          {moon.fact && <span className="text-slate-300">✨ {t(moon.fact)}</span>}
          <span className="text-[10px] text-slate-400">{t('photo: NASA (public domain)')}</span>
        </div>
      ) : p && def ? (
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-400">
          <span className="num">
            ☀️ {t('{au} AU from the Sun', { au: dec(p.distSunAu, 2) })} · 🌍{' '}
            {t('{au} AU ({km} mil. km) from Earth', { au: dec(p.distEarthAu, 2), km: int((p.distEarthAu * AU_KM) / 1e6) })}
          </span>
          <span className="num">
            ⌀ {int(def.diameterKm)} km · {t('tilt')} {def.facts.tiltDeg}° · ~{def.facts.tempC} °C
          </span>
          <span className="num">
            🔄 {t('day:')} {fmtRotation(def.facts.rotationH)} · 🗓 {t('year:')} {fmtYear(def.facts.yearDays)}
          </span>
          <span className="num">
            🧍 {t('gravity ×{g} — a 70 kg person weighs {w} here', { g: def.facts.gravityG, w: fmtWeight(def.facts.gravityG) })} · ☀️{' '}
            {t('sunlight takes {time}', { time: fmtLightTime(p.distSunAu) })}
          </span>
          <span>☁️ {t(def.facts.atmosphere)}</span>
          <span className="text-slate-300">✨ {t(def.facts.fact)}</span>
          {def.facts.moonCount > 0 && (
            <div className="mt-1 border-t border-white/10 pt-1">
              <span className="text-[10px] tracking-wide text-slate-400 uppercase">
                {t('Moons ({n} known', { n: def.facts.moonCount })}
                {moons.length > 0 ? t(', {n} shown', { n: moons.length }) : ''})
              </span>
              {moons.map((m) => (
                <p key={m.name} className="mt-0.5 text-xs">
                  <span className="text-slate-200">{t(m.name)}</span>{' '}
                  <span className="num text-slate-400">
                    · {t('orbits in')} {m.periodD < 2 ? `${(m.periodD * 24).toFixed(0)} h` : `${dec(m.periodD)} d`}
                    {m.retrograde ? ' ↺' : ''}
                  </span>
                  {m.fact && <span className="text-slate-400"> — {t(m.fact)}</span>}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : focus === 'sun' ? (
        <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-400">
          <span className="num">⌀ {t("1,392,700 km — 109× Earth · 99.86 % of the system's mass")}</span>
          <span className="num">🔥 {t('5,505 °C surface · ~15,000,000 °C core')}</span>
          <span className="num">
            🧍 {t('gravity ×28 — a 70 kg person would weigh nearly 2 tonnes (nowhere to stand, though)')}
          </span>
          <span className="num">💡 {t('light to Earth: 8 min 20 s · 🔄 spins once in ~25 days')}</span>
          <span className="text-slate-300">
            ✨ {t('about 1.3 million Earths would fit inside — and it fuses 600 million tonnes of hydrogen every second')}
          </span>
        </div>
      ) : focus === 'earth' ? (
        <p className="mt-1 text-xs text-slate-400">
          🏠{' '}
          {t('your home, still fully live — satellites, quakes and clouds keep running on the mini-globe. Click it to fly back home.')}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">
          {t(
            'the Sun and all 8 planets (Pluto included 💙) at their real positions for right now, true orbit ellipses, real relative sizes — Earth is the small blue one, still live. Click any body to orbit it; click Earth to come home.',
          )}
        </p>
      )}

      <div className="mt-2 border-t border-white/10 pt-2">
        <TimeWarp now={now} realNow={realNow} warp={warp} onWarp={onWarp} onWarpReset={onWarpReset} />
      </div>
    </HudCard>
  )
}
