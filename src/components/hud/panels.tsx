/** Read-only HUD panels: title, space weather, quakes, ISS, wiki, overhead. */

import { memo } from 'react'
import { HudCard } from './HudCard'
import { formatLocalClock, formatMag, timeAgo } from '../../lib/format'
import type { OverheadSat } from '../../lib/satellites'
import { quakeStats, type Quake } from '../../lib/quakes'
import { GIBS_LAYERS, type GibsLayer } from '../../lib/gibs'
import { kpColor, kpLabel } from '../../lib/spaceWeather'
import type { SpaceWeather } from '../../hooks'
import { t, useLang } from '../../lib/i18n'

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen()
}

export function TitleCard({
  now,
  satCount,
  usgsUpdatedAt,
  tleAgeDays,
  subtitle,
}: {
  now: number
  satCount: number
  usgsUpdatedAt: number | null
  tleAgeDays: number | null
  /** Mode-specific hint; defaults to the Earth overview line. */
  subtitle?: string
}) {
  return (
    <HudCard className="w-72 px-4 py-3 sm:px-5 sm:py-4">
      <h1 className="flex items-baseline gap-3 text-lg font-bold tracking-tight">
        🌍 Earth Pulse
        <span className="num text-xs font-medium text-slate-400">{formatLocalClock(now)}</span>
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={t('Toggle fullscreen')}
          title={t('fullscreen')}
          className="cursor-pointer text-sm text-slate-400 hover:text-slate-200"
        >
          ⛶
        </button>
      </h1>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-emerald-400" />
        {subtitle ??
          t('the planet, live — earthquakes · {sats} · space weather · Wikipedia', {
            sats: satCount > 0 ? t('{n} satellites', { n: satCount }) : 'ISS',
          })}
      </p>
      {usgsUpdatedAt === null && (
        <p className="mt-1 text-[11px] text-amber-300" role="status">⚠️ Awaiting USGS earthquake feed — live status unverified</p>
      )}
      {usgsUpdatedAt !== null && now - usgsUpdatedAt > 5 * 60_000 && (
        <p className="mt-1 text-[11px] text-amber-300" role="status">
          ⚠️ USGS feed has not updated for {Math.floor((now - usgsUpdatedAt) / 60_000)} minutes — quake data may be stale
        </p>
      )}
      {tleAgeDays !== null && tleAgeDays > 3 && (
        <p className="mt-1 text-[11px] text-amber-300" role="status">
          🛰 TLE data {Math.floor(tleAgeDays)} days old — satellite positions may be inaccurate
        </p>
      )}
    </HudCard>
  )
}

export const SpaceWeatherPanel = memo(function SpaceWeatherPanel({
  weather,
  moonLabel,
  onOpenMoon,
}: {
  weather: SpaceWeather
  moonLabel: string
  onOpenMoon: () => void
}) {
  useLang()
  const { kp, wind } = weather
  return (
    <HudCard className="w-72 px-4 py-3 sm:px-5 sm:py-4" delay={180}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        ☀️ {t('Space weather')}
      </h2>
      {kp ? (
        <p className="mt-1 text-xs text-slate-400">
          Kp{' '}
          <span className="num readout text-xl font-bold" style={{ color: kpColor(kp.kp) }}>
            {kp.kp.toFixed(1)}
          </span>{' '}
          <span style={{ color: kpColor(kp.kp) }}>{kpLabel(kp.kp)}</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">{t('reading magnetometers…')}</p>
      )}
      {wind && (
        <p className="num mt-0.5 text-xs text-slate-400">
          {t('solar wind')} {Math.round(wind.speedKms)} km/s
          {Number.isFinite(wind.densityPerCm3) && <> · {wind.densityPerCm3.toFixed(1)} p/cm³</>}
        </p>
      )}
      <button
        type="button"
        onClick={onOpenMoon}
        title={t('open the interactive Moon — Apollo landing sites & live phase')}
        className="mt-0.5 block cursor-pointer text-left text-xs text-slate-400 hover:text-sky-300"
      >
        🌙 {t('moon:')} {moonLabel} <span className="text-slate-400">· {t('explore')} ▸</span>
      </button>
      <p className="mt-2 text-[10px] text-amber-300/80">
        📡 {t('NOAA SWPC, refreshed every minute · aurora ovals on the globe scale with Kp')}
      </p>
    </HudCard>
  )
})

export function AbovePanel({
  overhead,
  onPickSat,
}: {
  overhead: OverheadSat[]
  onPickSat: (id: string, name: string) => void
}) {
  return (
    <HudCard className="hidden w-72 px-4 py-3 sm:block">
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        📡 {t('Above you now')}
      </h2>
      {overhead.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">{t('nothing above 10° right now')}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {overhead.slice(0, 5).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPickSat(s.id, s.name)}
                title={t('show orbit & fly to it')}
                className="flex w-full cursor-pointer items-baseline justify-between gap-2 text-left text-xs text-slate-300 hover:text-sky-300"
              >
                <span className="truncate">{s.name}</span>
                <span className="num text-slate-400">{Math.round(s.elevationDeg)}°</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </HudCard>
  )
}

export function QuakePanel({
  quakes,
  flashes,
  now,
  onFocusQuake,
  soundOn,
  onToggleSound,
  ambientOn,
  onToggleAmbient,
}: {
  quakes: Quake[]
  flashes: Quake[]
  now: number
  onFocusQuake: (quake: Quake) => void
  soundOn: boolean
  onToggleSound: () => void
  ambientOn: boolean
  onToggleAmbient: () => void
}) {
  const stats = quakeStats(quakes)
  const fresh = flashes[flashes.length - 1]
  const row = (label: string, q: Quake, accent: string, extra?: string) => (
    <button
      type="button"
      onClick={() => onFocusQuake(q)}
      title={t('fly there')}
      className="block max-w-56 cursor-pointer text-left text-xs text-slate-400 hover:text-slate-200"
    >
      {label}: <span className={accent}>{formatMag(q.mag)}</span> {q.place}
      {extra && <span className="num text-slate-400"> · {extra}</span>}
    </button>
  )
  return (
    <HudCard className="w-72 px-4 py-3 sm:px-5 sm:py-4" delay={120}>
      <h2 className="flex items-center justify-between gap-3 text-xs font-semibold tracking-wide text-slate-400 uppercase">
        <span>{t('Earthquakes · 24 h')}</span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={onToggleAmbient}
            aria-pressed={ambientOn}
            title={
              ambientOn
                ? t('ambient planet drone: on — calm when quiet, tense when the Earth shakes')
                : t('ambient planet drone: off')
            }
            className={`cursor-pointer rounded px-1 text-sm normal-case ${
              ambientOn ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            🎧
          </button>
          <button
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundOn}
            title={soundOn ? t('new-quake sound ping: on') : t('new-quake sound ping: off')}
            className={`cursor-pointer rounded px-1 text-sm normal-case ${
              soundOn ? 'text-emerald-300' : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            {soundOn ? '🔔' : '🔕'}
          </button>
        </span>
      </h2>
      <div className="num readout mt-1 text-3xl font-bold text-amber-300">{stats.count}</div>
      {fresh && (
        <button
          type="button"
          onClick={() => onFocusQuake(fresh)}
          className="slide-in mt-1 block max-w-56 cursor-pointer text-left text-xs"
        >
          <span className="mr-1.5 rounded bg-rose-500/20 px-1 font-bold text-rose-300">{t('NEW')}</span>
          <span className="text-slate-200">{formatMag(fresh.mag)}</span>{' '}
          <span className="text-slate-400">{fresh.place}</span>
        </button>
      )}
      {stats.latest && (
        <div className="mt-1">{row(t('latest'), stats.latest, 'text-slate-200', timeAgo(stats.latest.time, now))}</div>
      )}
      {stats.strongest && (
        <div className="mt-0.5">{row(t('strongest'), stats.strongest, 'text-rose-300')}</div>
      )}
      <p className="mt-2 text-[10px] text-amber-300/80">📡 {t('USGS, refreshed every minute')}</p>
    </HudCard>
  )
}

export function DataLayerPanel({
  active,
  onSelect,
  daysBack,
  onScrubDate,
  date,
}: {
  active: GibsLayer | null
  onSelect: (l: GibsLayer | null) => void
  daysBack: number
  onScrubDate: (d: number) => void
  date: string
}) {
  const chip = (key: string, label: string, on: boolean, onClick: () => void) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded px-2 py-0.5 text-[11px] transition-colors ${
        on ? 'bg-sky-500/25 text-sky-100' : 'bg-white/5 text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
  return (
    <HudCard className="w-72 px-4 py-3" delay={200}>
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
        🛰 {t('NASA data layers')}
      </h2>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {chip('live', t('live globe'), active === null, () => onSelect(null))}
        {GIBS_LAYERS.map((l) => chip(l.id, t(l.label), active?.id === l.id, () => onSelect(l)))}
      </div>
      {active && (
        <div className="mt-2">
          <p className="text-[11px] text-slate-400">{t(active.blurb)}</p>
          {active.legend && (
            <div className="mt-1.5">
              <div
                className="h-2 w-full rounded"
                style={{ background: `linear-gradient(to right, ${active.legend.stops.join(',')})` }}
              />
              <div className="num mt-0.5 flex justify-between text-[10px] text-slate-400">
                {active.legend.ticks.map((t, i) => (
                  <span key={i}>{t}</span>
                ))}
              </div>
            </div>
          )}
          {active.monthly ? (
            <p className="mt-1.5 text-[11px] text-slate-300">
              📅 {t('monthly')} · <span className="num">{date.slice(0, 7)}</span>
            </p>
          ) : (
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="range"
                min={2}
                max={30}
                value={daysBack}
                onChange={(e) => onScrubDate(Number(e.target.value))}
                aria-label={t('Imagery date, days before now')}
                className="h-1 flex-1 cursor-pointer accent-sky-400"
              />
              <span className="num text-[10px] whitespace-nowrap text-slate-300">{date}</span>
            </div>
          )}
          <p className="mt-1 text-[10px] text-amber-300/80">
            📡 NASA GIBS{active.monthly ? '' : ` · ${t('slide to replay past days')}`}
          </p>
        </div>
      )}
    </HudCard>
  )
}

