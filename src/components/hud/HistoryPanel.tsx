/** 🏛 History of the planet: scrub or play through the events that shaped the
 * Earth — each appears on the globe in order and the camera flies to it. */

import { memo } from 'react'
import { HudCard } from './HudCard'
import { eventMeta } from '../../lib/events'
import { HISTORIC_EVENTS, yearOf } from '../../lib/history'

function fmtYear(y: number): string {
  return y < 1000 ? `AD ${y}` : String(y)
}

export const HistoryPanel = memo(function HistoryPanel({
  count,
  total,
  playing,
  onScrub,
  onPlay,
  onClose,
}: {
  count: number
  total: number
  playing: boolean
  onScrub: (n: number) => void
  onPlay: () => void
  onClose: () => void
}) {
  const current = count > 0 ? HISTORIC_EVENTS[count - 1] : null
  const m = current ? eventMeta(current.category) : null
  return (
    <HudCard className="w-72 px-4 py-3" delay={60}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">🏛 History of the planet</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close history"
          className="cursor-pointer rounded px-1 text-xs text-rose-400/80 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
        >
          ✕
        </button>
      </div>
      <div className="mt-2 min-h-10">
        {current && m ? (
          <>
            <p className="num text-lg leading-none font-bold" style={{ color: m.color }}>
              {fmtYear(yearOf(current))}
            </p>
            <p className="mt-0.5 text-xs text-slate-200">
              {m.icon} {current.title}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400">The globe is quiet — drag the slider or press play.</p>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={total}
        step={1}
        value={count}
        onChange={(e) => onScrub(Number(e.target.value))}
        aria-label="History timeline"
        aria-valuetext={current ? `${fmtYear(yearOf(current))}: ${current.title}` : 'no events yet'}
        className="mt-2 w-full cursor-pointer accent-amber-400"
      />
      <div className="num flex justify-between text-[10px] text-slate-500">
        <span>{fmtYear(yearOf(HISTORIC_EVENTS[0]))}</span>
        <span>
          {count} / {total}
        </span>
        <span>{fmtYear(yearOf(HISTORIC_EVENTS[total - 1]))}</span>
      </div>
      <button
        type="button"
        onClick={onPlay}
        className="mt-2.5 w-full cursor-pointer rounded border border-amber-400/30 px-2 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-400/10"
      >
        {playing ? '❚❚ pause' : count >= total ? '▶ play from the start' : '▶ play'}
      </button>
    </HudCard>
  )
})
