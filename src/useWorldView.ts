/** The world/view state machine: which world we're in (Earth / Moon / solar /
 * drift), what's followed or focused, plus the unified navigation that jumps
 * straight between worlds from any world. Self-contained — it owns all of its
 * own state, so App just reads the result. */

import { useCallback, useState } from 'react'
import { useSolarTime } from './uiHooks'
import type { ApolloSite } from './lib/moon'
import type { StarPick } from './lib/stars'

export function useWorldView() {
  const [followIss, setFollowIss] = useState(false)
  // 🛰 satellite the camera is locked onto (flies with it, orbits around it)
  const [followSat, setFollowSat] = useState<{ id: string; name: string } | null>(null)

  // 🎬 cinematic tour
  const [tourOn, setTourOn] = useState(false)
  const onTourToggle = useCallback(() => {
    setTourOn((t) => {
      if (!t) setFollowIss(false)
      return !t
    })
  }, [])
  const onTourBroken = useCallback(() => setTourOn(false), [])
  // 🌙 moon mode: click the Moon (or the HUD line) → orbit IT instead of Earth
  const [moonMode, setMoonMode] = useState(false)
  const [apolloSite, setApolloSite] = useState<ApolloSite | null>(null)
  // 🪐 solar system mode + ⏩ time-warp (simMs runs warp× faster than real)
  const [solarMode, setSolarMode] = useState(false)
  // 🌍 continental-drift mode: a full-screen Pangaea→today globe (own scene)
  const [driftMode, setDriftMode] = useState(false)
  const [focusPlanet, setFocusPlanet] = useState<string | null>(null)
  // ⭐ the star whose info card is open (solar view only)
  const [pickedStar, setPickedStar] = useState<StarPick | null>(null)
  const { solarTime, onWarp, onWarpReset, onVisibilityChange } = useSolarTime()
  const onMoonEnter = useCallback(() => {
    setMoonMode(true)
    setSolarMode(false)
    setFollowIss(false)
    setTourOn(false)
    setApolloSite(null)
  }, [])
  const onMoonExit = useCallback(() => {
    setMoonMode(false)
    setApolloSite(null)
  }, [])
  const onApolloPick = useCallback((site: ApolloSite | null) => setApolloSite(site), [])

  // which world the HUD lives in right now
  const mode: 'earth' | 'moon' | 'solar' = solarMode ? 'solar' : moonMode ? 'moon' : 'earth'
  // navigating to a body/overview always closes any open star card, so the
  // primary slot only ever holds ONE card (planet OR star, never both)
  const onSolarOverview = useCallback(() => {
    setFocusPlanet(null)
    setPickedStar(null)
  }, [])
  const onSolarExit = useCallback(() => {
    setSolarMode(false)
    setFocusPlanet(null)
    setPickedStar(null)
    onWarpReset() // Earth always comes back live
  }, [onWarpReset])
  const onPlanetPick = useCallback(
    (id: string) => {
      if (id === 'earth') return onSolarExit()
      setPickedStar(null)
      // click the body you're already orbiting → let go and pull back to the
      // system overview, exactly like clicking a followed satellite again
      setFocusPlanet((prev) => (prev === id ? null : id))
    },
    [onSolarExit],
  )

  // unified world navigation — jump straight to any world from any world, so
  // you're never stranded needing to back out through Earth first.
  const goEarth = useCallback(() => {
    setSolarMode(false)
    setDriftMode(false)
    setFocusPlanet(null)
    onWarpReset()
    setMoonMode(false)
    setApolloSite(null)
    setFollowIss(false)
    setFollowSat(null)
    setTourOn(false)
  }, [onWarpReset])
  const goDrift = useCallback(() => {
    setDriftMode(true)
    setSolarMode(false)
    setMoonMode(false)
    setFollowIss(false)
    setFollowSat(null)
    setTourOn(false)
  }, [])
  const goMoon = useCallback(() => {
    onMoonEnter()
    onWarpReset()
    setFocusPlanet(null)
    setDriftMode(false)
    setFollowSat(null)
  }, [onMoonEnter, onWarpReset])
  const goSolar = useCallback(() => {
    setSolarMode(true)
    setMoonMode(false)
    setApolloSite(null)
    setFocusPlanet(null)
    setPickedStar(null)
    setFollowIss(false)
    setFollowSat(null)
    setTourOn(false)
    setDriftMode(false)
  }, [])

  return {
    followIss,
    setFollowIss,
    followSat,
    setFollowSat,
    tourOn,
    setTourOn,
    onTourToggle,
    onTourBroken,
    moonMode,
    setMoonMode,
    apolloSite,
    setApolloSite,
    onMoonEnter,
    onMoonExit,
    onApolloPick,
    solarMode,
    setSolarMode,
    driftMode,
    setDriftMode,
    focusPlanet,
    setFocusPlanet,
    pickedStar,
    onStarPick: setPickedStar,
    mode,
    onSolarOverview,
    onSolarExit,
    onPlanetPick,
    solarTime,
    onWarp,
    onWarpReset,
    onVisibilityChange,
    goEarth,
    goMoon,
    goSolar,
    goDrift,
  }
}
