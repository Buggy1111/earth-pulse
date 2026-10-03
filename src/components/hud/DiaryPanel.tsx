/** 📓 Planet diary card: the last 24 h in one glance, with a one-click replay
 * of the day on the globe (the quake timeline) and a copy-as-text share. */

import { useMemo, useState } from 'react'
import { HudCard } from './HudCard'
import { buildDiary, diaryText, type DiaryInput } from '../../lib/diary'
import { magColor } from '../../lib/quakes'
import { kpColor, kpLabel } from '../../lib/spaceWeather'

export function DiaryPanel({
  input,
  onReplay,
  onClose,
}: {
  input: DiaryInput
  onReplay: () => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  // the day changes slowly — rebuild once a minute, not on every clock tick
  const minute = Math.floor(input.now / 60_000)
  const d = useMemo(
    () => buildDiary({ ...input, now: minute * 60_000 }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input.quakes, input.events, input.kp, input.windKms, minute],
  )
  const peak = Math.max(1, ...d.hourly)

  const copy = () => {
    navigator.clipboard
      ?.writeText(diaryText(d, minute * 60_000))
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {
        // clipboard blocked (permissions / insecure context) — nothing to do
      })
  }

  return (
    <HudCard className="w-72 px-4 py-3" delay={60}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">📓 Planet diary · 24 h</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close diary"
          className="cursor-pointer rounded px-1 text-xs text-rose-400/80 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
        >
          ✕
        </button>
      </div>
      <p className="mt-1.5 text-sm leading-snug font-medium text-slate-100">{d.headline}</p>

      {/* quakes per hour, oldest → now */}
      <div className="mt-2.5 flex h-9 items-end gap-px" role="img" aria-label={`${d.quakeCount} earthquakes per hour over the last 24 hours`}>
        {d.hourly.map((n, i) => (
          <div
            key={i}
            className="flex-1 rounded-t-[1px] bg-amber-400/70"
            style={{ height: `${n === 0 ? 4 : 8 + (n / peak) * 92}%`, opacity: n === 0 ? 0.25 : 1 }}
            title={`${n} quake${n === 1 ? '' : 's'}, ${DIARY_AGO(d.hourly.length - 1 - i)}`}
          />
        ))}
      </div>
      <div className="num mt-0.5 flex justify-between text-[10px] text-slate-500">
        <span>−24 h</span>
        <span>now</span>
      </div>

      <dl className="mt-2 space-y-1 text-xs text-slate-400">
        <div className="flex justify-between">
          <dt>🌐 earthquakes</dt>
          <dd className="num text-slate-200">
            {d.quakeCount} · <span className="text-orange-300">{d.strongCount} of M 5+</span>
          </dd>
        </div>
        {d.strongest && (
          <div className="flex justify-between gap-2">
            <dt className="shrink-0">strongest</dt>
            <dd className="num truncate text-right" title={d.strongest.place}>
              <span style={{ color: magColor(d.strongest.mag) }}>M {d.strongest.mag.toFixed(1)}</span>{' '}
              <span className="text-slate-300">{d.strongest.place}</span>
            </dd>
          </div>
        )}
        {d.busiest && (
          <div className="flex justify-between gap-2">
            <dt className="shrink-0">busiest</dt>
            <dd className="num truncate text-right text-slate-300">
              {d.busiest.region} ({d.busiest.count})
            </dd>
          </div>
        )}
        {d.eventGroups.length > 0 && (
          <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 pt-0.5 text-slate-300">
            {d.eventGroups.map((g) => (
              <span key={g.category} title={g.label}>
                {g.icon} <span className="num">{g.count}</span> {g.label.toLowerCase()}
              </span>
            ))}
          </div>
        )}
        {d.kp !== null && (
          <div className="flex justify-between">
            <dt>☀️ geomagnetism</dt>
            <dd className="num" style={{ color: kpColor(d.kp) }}>
              Kp {d.kp.toFixed(1)} · {kpLabel(d.kp)}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onReplay}
          className="flex-1 cursor-pointer rounded border border-amber-400/30 px-2 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-400/10"
        >
          ▶ replay the day
        </button>
        <button
          type="button"
          onClick={copy}
          className="cursor-pointer rounded border border-white/15 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-white/10"
        >
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
    </HudCard>
  )
}

const DIARY_AGO = (h: number) => (h === 0 ? 'this hour' : `${h} h ago`)
