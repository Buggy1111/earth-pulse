/** Every live data feed the app renders — earthquakes (USGS + EMSC merged), the
 * ISS, the tracked satellites, space weather, the Wikipedia edit ticker and the
 * shared clock — gathered in one hook so App stays focused on view wiring. */

import { useMemo } from 'react'
import {
  useEmsc,
  useIss,
  useNow,
  useQuakes,
  useSpaceWeather,
  useTleSats,
  useWikiFeed,
} from './hooks'
import { useQuakePing } from './uiHooks'
import { mergeQuakes } from './lib/emsc'

export function useLiveData() {
  const { quakes: usgsQuakes, newQuakes, flashes: usgsFlashes } = useQuakes()
  const { quakes: emscQuakes, fresh: emscFresh } = useEmsc()
  const quakes = useMemo(() => mergeQuakes(usgsQuakes, emscQuakes), [usgsQuakes, emscQuakes])
  const flashes = useMemo(() => [...usgsFlashes, ...emscFresh], [usgsFlashes, emscFresh])
  const iss = useIss()
  const sats = useTleSats()
  const weather = useSpaceWeather()
  const { edits, totalSeen } = useWikiFeed()
  const now = useNow()
  const { soundOn, toggleSound } = useQuakePing(newQuakes, emscFresh)
  return { quakes, flashes, iss, sats, weather, edits, totalSeen, now, soundOn, toggleSound }
}
