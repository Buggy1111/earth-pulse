/** 🏛 History mode state: whether it's open, how many events of the chronology
 * are on the globe, and the auto-playing "film" through them. Focusing an event
 * (fly there + open its card) is delegated to the caller. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EarthEvent } from './lib/events'
import { HISTORIC_EVENTS, historyUpTo } from './lib/history'

const STEP_MS = 3800
const N = HISTORIC_EVENTS.length

export function useHistory(onFocus: (e: EarthEvent) => void, onClose: () => void) {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(N)
  const [playing, setPlaying] = useState(false)

  // the film: advance one event at a time, flying to each as it appears
  useEffect(() => {
    if (!open || !playing) return
    if (count >= N) return // the film is over (`isPlaying` below already reads false)
    const id = setTimeout(() => {
      setCount(count + 1)
    }, STEP_MS)
    return () => clearTimeout(id)
  }, [open, playing, count])

  const show = useCallback(
    (c: number) => {
      const next = Math.max(0, Math.min(N, Math.round(c)))
      setCount(next)
      if (next > 0) onFocus(HISTORIC_EVENTS[next - 1])
      else onClose() // nothing on the globe any more → drop the open event card
    },
    [onFocus, onClose],
  )

  const toggle = useCallback(() => {
    setPlaying(false)
    setCount(N)
    onClose() // opening swaps the live pins for the chronology → drop a live event card too
    setOpen(!open)
  }, [open, onClose])

  /** Shut History mode down for good (e.g. when leaving the Earth view). */
  const close = useCallback(() => {
    if (!open) return
    setPlaying(false)
    setCount(N)
    setOpen(false)
    onClose()
  }, [open, onClose])

  // the film ends the moment the last event is on screen — derived, so the button flips back to ▶ at once
  const isPlaying = playing && count < N

  const play = useCallback(() => {
    if (isPlaying) return setPlaying(false)
    if (count >= N || count < 1) {
      // at the end (or just opened with everything shown): start the film from the top
      setCount(1)
      onFocus(HISTORIC_EVENTS[0])
    } else {
      onFocus(HISTORIC_EVENTS[count - 1]) // resume AT the paused event, don't skip one
    }
    setPlaying(true)
  }, [isPlaying, count, onFocus])

  // keep the camera following the film
  useEffect(() => {
    if (open && playing && count > 0) onFocus(HISTORIC_EVENTS[count - 1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  const shown = useMemo(() => historyUpTo(count), [count])
  return { open, count, playing: isPlaying, shown, total: N, toggle, play, show, close }
}
