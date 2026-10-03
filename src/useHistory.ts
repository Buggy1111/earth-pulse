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
    const id = setTimeout(() => {
      if (count >= N) setPlaying(false)
      else setCount(count + 1)
    }, STEP_MS)
    return () => clearTimeout(id)
  }, [open, playing, count])

  const show = useCallback(
    (c: number) => {
      const next = Math.max(0, Math.min(N, Math.round(c)))
      setCount(next)
      if (next > 0) onFocus(HISTORIC_EVENTS[next - 1])
    },
    [onFocus],
  )

  const toggle = useCallback(() => {
    setPlaying(false)
    setCount(N)
    if (open) onClose()
    setOpen(!open)
  }, [open, onClose])

  const play = useCallback(() => {
    if (playing) return setPlaying(false)
    // restart from the first event when at the end (or just starting)
    setCount(count >= N ? 1 : count + 1)
    if (count >= N) onFocus(HISTORIC_EVENTS[0])
    else onFocus(HISTORIC_EVENTS[count])
    setPlaying(true)
  }, [playing, count, onFocus])

  // keep the camera following the film
  useEffect(() => {
    if (open && playing && count > 0) onFocus(HISTORIC_EVENTS[count - 1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  const shown = useMemo(() => historyUpTo(count), [count])
  return { open, count, playing, shown, total: N, toggle, play, show }
}
