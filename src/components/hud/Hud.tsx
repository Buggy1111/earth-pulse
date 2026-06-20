/** The HUD overlay: builds every panel once, then arranges them into desktop
 * corner dashboards or, on phones & tablets, two slide-out drawers so the
 * globe stays clear. Rendered only when the HUD is visible. */

import type { ComponentProps } from 'react'
import {
  AbovePanel,
  DataLayerPanel,
  QuakePanel,
  SpaceWeatherPanel,
  TitleCard,
} from './panels'
import { EventsPanel, IssPanel, MissionCard, QuakeDetail, WikiPanel } from './panelsLive'
import { EarthDock, ModeSwitcher, SideDrawer, TimelinePanel } from './controls'
import { SettingsPanel } from './SettingsPanel'
import { MoonPanel } from '../MoonPanel'
import { PlanetPanel } from '../PlanetPanel'
import { StarPanel } from '../StarPanel'
import { SolarNavTree } from './SolarNavTree'
import type { ProbeTraj } from '../../lib/probes'
import type { StarPick } from '../../lib/stars'
import { TimeWarp } from './TimeWarp'
import { ViewportFrame } from './ViewportFrame'
import type { LayerState, OrbitEntry } from './types'

interface HudProps {
  mode: 'earth' | 'moon' | 'solar' | 'drift'
  isDesktop: boolean
  drawer: 'left' | 'right' | null
  onToggleLeft: () => void
  onToggleRight: () => void
  // world switcher
  onEarth: () => void
  onMoon: () => void
  onSolar: () => void
  onDrift: () => void
  // title + clock
  now: number
  satCount: number
  solarMode: boolean
  moonMode: boolean
  // space weather / moon / planet primary panel
  weather: ComponentProps<typeof SpaceWeatherPanel>['weather']
  moonLabel: string
  onMoonEnter: () => void
  moonState: ComponentProps<typeof MoonPanel>['moon']
  apolloSite: ComponentProps<typeof MoonPanel>['picked']
  onMoonExit: () => void
  focusPlanet: string | null
  // ⭐ the star whose card is open (solar view) — shown in the SAME slot as the
  // planet card so clicking a star and clicking a planet land in one place
  pickedStar: StarPick | null
  onStarPick: (s: StarPick | null) => void
  solarSimNow: number
  warp: number
  onWarp: (factor: number) => void
  onWarpReset: () => void
  onSolarOverview: () => void
  onSolarExit: () => void
  onNavigateBody: (id: string) => void
  probes: ProbeTraj[]
  // customize
  layers: LayerState
  onToggleLayer: (key: keyof LayerState) => void
  orbits: OrbitEntry[]
  onRemoveOrbit: (id: string) => void
  onClearOrbits: () => void
  satList: OrbitEntry[]
  onPickSat: (id: string, name: string) => void
  eco: boolean
  onToggleEco: () => void
  earthSpin: boolean
  onToggleEarthSpin: () => void
  kioskEnabled: boolean
  onToggleKiosk: () => void
  userLoc: { lat: number; lng: number } | null
  locating: boolean
  onLocate: () => void
  overhead: ComponentProps<typeof AbovePanel>['overhead']
  // timeline + quakes
  timeOffsetH: number
  timelinePlaying: boolean
  onTimelineScrub: (h: number) => void
  onTimelineToggle: () => void
  displayQuakes: ComponentProps<typeof QuakePanel>['quakes']
  flashes: ComponentProps<typeof QuakePanel>['flashes']
  simNow: number
  onFocusQuake: ComponentProps<typeof QuakePanel>['onFocusQuake']
  soundOn: boolean
  onToggleSound: () => void
  selected: ComponentProps<typeof QuakeDetail>['quake'] | null
  onCloseQuake: () => void
  // events + data layers
  events: ComponentProps<typeof EventsPanel>['events']
  onEventClick: ComponentProps<typeof EventsPanel>['onEventClick']
  gibsLayer: ComponentProps<typeof DataLayerPanel>['active']
  onSelectGibs: ComponentProps<typeof DataLayerPanel>['onSelect']
  gibsDaysBack: number
  onScrubGibs: (days: number) => void
  gibsDate: string
  // wiki + mission
  edits: ComponentProps<typeof WikiPanel>['edits']
  totalSeen: number
  selectedMission: string | null
  onCloseMission: () => void
  // dock + ISS
  tourOn: boolean
  followIss: boolean
  onTour: () => void
  onFollow: () => void
  onResetView: () => void
  onHideHud: () => void
  iss: ComponentProps<typeof IssPanel>['iss']
  issPass: ComponentProps<typeof IssPanel>['pass']
}

export function Hud(p: HudProps) {
  const titleEl = (
    <TitleCard
      now={p.now}
      satCount={p.satCount}
      subtitle={
        p.solarMode
          ? 'the solar system, live — click any body to orbit it'
          : p.moonMode
            ? 'orbiting the Moon — drag to orbit, scroll to zoom'
            : undefined
      }
    />
  )
  const primaryEl =
    p.mode === 'earth' ? (
      <SpaceWeatherPanel weather={p.weather} moonLabel={p.moonLabel} onOpenMoon={p.onMoonEnter} />
    ) : p.mode === 'moon' ? (
      <MoonPanel moon={p.moonState} picked={p.apolloSite} onBack={p.onMoonExit} />
    ) : p.pickedStar ? (
      // clicked a star → its card takes the primary slot (closing it flies back)
      <StarPanel star={p.pickedStar} onClose={() => p.onStarPick(null)} />
    ) : (
      <PlanetPanel
        focus={p.focusPlanet}
        now={p.solarSimNow}
        realNow={p.now}
        warp={p.warp}
        probes={p.probes}
        onWarp={p.onWarp}
        onWarpReset={p.onWarpReset}
        onOverview={p.onSolarOverview}
        onBack={p.onSolarExit}
      />
    )
  const settingsEl =
    p.mode === 'earth' ? (
      <SettingsPanel
        layers={p.layers}
        onToggleLayer={p.onToggleLayer}
        orbits={p.orbits}
        onRemoveOrbit={p.onRemoveOrbit}
        onClearOrbits={p.onClearOrbits}
        satList={p.satList}
        onPickSat={p.onPickSat}
        eco={p.eco}
        onToggleEco={p.onToggleEco}
        earthSpin={p.earthSpin}
        onToggleEarthSpin={p.onToggleEarthSpin}
        kioskEnabled={p.kioskEnabled}
        onToggleKiosk={p.onToggleKiosk}
        userLoc={p.userLoc}
        locating={p.locating}
        onLocate={p.onLocate}
      />
    ) : null
  // ⏩ time-warp: in the Earth view the Moon drifts at its true ~14°/h, so live
  // it looks frozen — this lets you speed time up and watch it orbit (also sweeps
  // the day/night terminator and the satellites). Solar view has its own copy.
  const timeWarpEl =
    p.mode === 'earth' ? (
      <div className="hud pointer-events-auto w-72 px-4 py-2">
        <TimeWarp
          now={p.solarSimNow}
          realNow={p.now}
          warp={p.warp}
          onWarp={p.onWarp}
          onWarpReset={p.onWarpReset}
        />
      </div>
    ) : null
  const aboveEl =
    p.mode === 'earth' && p.userLoc ? (
      <AbovePanel overhead={p.overhead} onPickSat={p.onPickSat} />
    ) : null
  const timelineEl =
    p.mode === 'earth' ? (
      <TimelinePanel
        offsetH={p.timeOffsetH}
        playing={p.timelinePlaying}
        onScrub={p.onTimelineScrub}
        onTogglePlay={p.onTimelineToggle}
      />
    ) : null
  const quakeEl =
    p.mode === 'earth' ? (
      <QuakePanel
        quakes={p.displayQuakes}
        flashes={p.flashes}
        now={p.simNow}
        onFocusQuake={p.onFocusQuake}
        soundOn={p.soundOn}
        onToggleSound={p.onToggleSound}
      />
    ) : null
  const eventsEl =
    p.mode === 'earth' && p.layers.events ? (
      <EventsPanel events={p.events} onEventClick={p.onEventClick} />
    ) : null
  const dataLayerEl =
    p.mode === 'earth' ? (
      <DataLayerPanel
        active={p.gibsLayer}
        onSelect={p.onSelectGibs}
        daysBack={p.gibsDaysBack}
        onScrubDate={p.onScrubGibs}
        date={p.gibsDate}
      />
    ) : null
  const topRightEl =
    p.mode === 'earth' ? (
      <WikiPanel edits={p.edits} totalSeen={p.totalSeen} />
    ) : p.mode === 'solar' ? (
      <SolarNavTree focus={p.focusPlanet} now={p.solarSimNow} probes={p.probes} onNavigate={p.onNavigateBody} onOverview={p.onSolarOverview} />
    ) : null
  const quakeDetailEl =
    p.mode === 'earth' && p.selected ? (
      <QuakeDetail quake={p.selected} now={p.now} onClose={p.onCloseQuake} />
    ) : null
  const missionEl =
    p.mode === 'earth' && p.selectedMission ? (
      <MissionCard name={p.selectedMission} onClose={p.onCloseMission} />
    ) : null
  const dockEl =
    p.mode === 'earth' ? (
      <EarthDock
        tourOn={p.tourOn}
        followIss={p.followIss}
        showFollow={p.layers.iss}
        onTour={p.onTour}
        onFollow={p.onFollow}
        onResetView={p.onResetView}
        onHideHud={p.onHideHud}
      />
    ) : null
  const issEl = p.mode === 'earth' ? <IssPanel iss={p.iss} pass={p.issPass} now={p.now} /> : null

  return (
    <>
      {/* signature viewport chrome — corner brackets + telemetry status line */}
      <ViewportFrame mode={p.mode} now={p.now} satCount={p.satCount} />

      {/* world switcher — always visible above everything, both layouts */}
      <div className="pointer-events-none fixed top-3 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1 sm:top-4">
        <span className="vf-eyebrow hidden sm:block">◂ orbital telemetry console ▸</span>
        <ModeSwitcher
          mode={p.mode}
          onEarth={p.onEarth}
          onMoon={p.onMoon}
          onSolar={p.onSolar}
          onDrift={p.onDrift}
        />
      </div>

      {p.isDesktop ? (
        <div className="pointer-events-none fixed inset-0">
          {/* top & bottom anchored independently → a tall panel never shoves
              the other off-screen */}
          <div className="pointer-events-none absolute inset-x-6 top-6 flex items-start justify-between gap-4">
            <div className="flex flex-col items-start gap-3">
              {titleEl}
              {primaryEl}
              {timeWarpEl}
              {settingsEl}
              <div className="hide-short">{aboveEl}</div>
            </div>
            <div>{topRightEl}</div>
          </div>
          <div className="pointer-events-none absolute inset-x-6 bottom-6 flex items-end justify-between gap-4">
            <div className="flex flex-col items-start gap-3">
              {timelineEl}
              {quakeEl}
              <div className="hide-short">{eventsEl}</div>
              <div className="hide-short">{dataLayerEl}</div>
            </div>
            <div className="flex flex-col items-end gap-3">
              {quakeDetailEl}
              {missionEl}
              {dockEl}
              {issEl}
            </div>
          </div>
        </div>
      ) : (
        <>
          <SideDrawer side="left" open={p.drawer === 'left'} onToggle={p.onToggleLeft} icon="📊" title="data">
            {titleEl}
            {primaryEl}
            {timeWarpEl}
            {timelineEl}
            {quakeEl}
            {eventsEl}
            {dataLayerEl}
            {settingsEl}
            {aboveEl}
          </SideDrawer>
          <SideDrawer
            side="right"
            open={p.drawer === 'right'}
            onToggle={p.onToggleRight}
            icon="🛰"
            title="live & controls"
          >
            {dockEl}
            {issEl}
            {topRightEl}
            {quakeDetailEl}
            {missionEl}
          </SideDrawer>
        </>
      )}

      <p className="pointer-events-none fixed bottom-1 left-1/2 -translate-x-1/2 text-center text-[10px] text-slate-600">
        Earth Pulse · open source · no API keys · zoom imagery © Esri &amp; contributors · textures ©
        Solar System Scope (CC BY)
      </p>
    </>
  )
}
