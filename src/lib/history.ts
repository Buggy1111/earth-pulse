/** 🏛 History of the planet: the events that shaped (or shook) the Earth, as a
 * hand-curated chronology shown on the globe. They reuse the live-event shape
 * (EarthEvent) so the existing event pins, rings and detail card render them
 * unchanged — History mode just swaps the data underneath.
 *
 * Figures are the commonly cited estimates (USGS / Smithsonian GVP / NOAA); death
 * tolls and magnitudes of old events are uncertain and shown as approximate. */

import type { EarthEvent } from './events'

interface Hist {
  year: number
  month?: number
  day?: number
  title: string
  category: string
  lat: number
  lng: number
  /** Short, formatted size ("M 9.5", "VEI 7"). */
  size: string
  note: string
}

const H: Hist[] = [
  { year: 79, month: 8, day: 24, title: 'Vesuvius buries Pompeii', category: 'volcanoes', lat: 40.821, lng: 14.426, size: 'VEI 5', note: 'Pompeii and Herculaneum vanish under ash and pyroclastic flows, preserving a Roman city almost intact.' },
  { year: 1556, month: 1, day: 23, title: 'Shaanxi earthquake', category: 'earthquakes', lat: 34.5, lng: 109.7, size: '~M 8', note: 'The deadliest earthquake on record — about 830,000 died, many in collapsing cave dwellings.' },
  { year: 1755, month: 11, day: 1, title: 'Great Lisbon earthquake', category: 'earthquakes', lat: 36.0, lng: -10.0, size: '~M 8.5–9', note: 'Quake, tsunami and fire destroy Lisbon on All Saints\' Day, shaking European thought for a generation.' },
  { year: 1783, month: 6, day: 8, title: 'Laki fissure eruption', category: 'volcanoes', lat: 64.07, lng: -18.23, size: '15 km³ lava', note: 'Iceland\'s haze famine killed about a fifth of its people and chilled the Northern Hemisphere.' },
  { year: 1815, month: 4, day: 10, title: 'Mount Tambora', category: 'volcanoes', lat: -8.25, lng: 118.0, size: 'VEI 7', note: 'The largest eruption in recorded history — and 1816, the "Year Without a Summer".' },
  { year: 1859, month: 9, day: 1, title: 'Carrington Event', category: 'solarStorm', lat: 51.24, lng: -0.17, size: 'G5 storm', note: 'The most intense solar storm on record: auroras over the tropics and telegraph wires sparking.' },
  { year: 1883, month: 8, day: 27, title: 'Krakatoa', category: 'volcanoes', lat: -6.1, lng: 105.42, size: 'VEI 6', note: 'The loudest sound in recorded history, heard 4,800 km away; tsunamis killed some 36,000.' },
  { year: 1900, month: 9, day: 8, title: 'Galveston hurricane', category: 'severeStorms', lat: 29.3, lng: -94.8, size: 'Cat 4', note: 'The deadliest natural disaster in US history — an estimated 8,000 lives.' },
  { year: 1902, month: 5, day: 8, title: 'Mont Pelée', category: 'volcanoes', lat: 14.809, lng: -61.165, size: 'VEI 4', note: 'A glowing cloud erased the town of Saint-Pierre in minutes; two survived of some 28,000.' },
  { year: 1906, month: 4, day: 18, title: 'San Francisco earthquake', category: 'earthquakes', lat: 37.75, lng: -122.55, size: 'M 7.9', note: 'The San Andreas Fault ruptured along 477 km; the fires that followed destroyed most of the city.' },
  { year: 1908, month: 6, day: 30, title: 'Tunguska event', category: 'impact', lat: 60.886, lng: 101.894, size: '~12 Mt airburst', note: 'A stony asteroid exploded over Siberia, flattening 2,000 km² of forest.' },
  { year: 1912, month: 6, day: 6, title: 'Novarupta', category: 'volcanoes', lat: 58.27, lng: -155.16, size: 'VEI 6', note: 'The largest eruption of the 20th century, in remote Alaska — the Valley of Ten Thousand Smokes.' },
  { year: 1960, month: 5, day: 22, title: 'Great Chilean earthquake', category: 'earthquakes', lat: -38.24, lng: -73.05, size: 'M 9.5', note: 'The strongest earthquake ever measured; its tsunami crossed the Pacific to Japan.' },
  { year: 1964, month: 3, day: 27, title: 'Good Friday earthquake', category: 'earthquakes', lat: 61.05, lng: -147.48, size: 'M 9.2', note: 'North America\'s strongest quake — four minutes of shaking around Anchorage, Alaska.' },
  { year: 1970, month: 11, day: 12, title: 'Bhola cyclone', category: 'severeStorms', lat: 22.0, lng: 90.5, size: '~300k deaths', note: 'The deadliest tropical cyclone ever recorded, striking the Ganges delta.' },
  { year: 1980, month: 5, day: 18, title: 'Mount St. Helens', category: 'volcanoes', lat: 46.2, lng: -122.19, size: 'VEI 5', note: 'The largest landslide in recorded history unleashed a lateral blast across Washington State.' },
  { year: 1986, month: 4, day: 26, title: 'Chernobyl disaster', category: 'manmade', lat: 51.389, lng: 30.099, size: 'INES 7', note: 'The worst nuclear accident in history; a radioactive plume reached across Europe.' },
  { year: 1991, month: 6, day: 15, title: 'Mount Pinatubo', category: 'volcanoes', lat: 15.13, lng: 120.35, size: 'VEI 6', note: 'Its aerosols cooled the whole planet by about 0.5 °C for two years.' },
  { year: 2004, month: 12, day: 26, title: 'Indian Ocean earthquake & tsunami', category: 'earthquakes', lat: 3.3, lng: 95.98, size: 'M 9.1', note: 'Waves up to 30 m struck 14 countries; roughly 230,000 people died.' },
  { year: 2005, month: 8, day: 29, title: 'Hurricane Katrina', category: 'severeStorms', lat: 29.3, lng: -89.6, size: 'Cat 5 → 3', note: 'Levee failures flooded 80% of New Orleans; the costliest US hurricane of its time.' },
  { year: 2010, month: 1, day: 12, title: 'Haiti earthquake', category: 'earthquakes', lat: 18.45, lng: -72.53, size: 'M 7.0', note: 'A shallow quake directly under Port-au-Prince — over 200,000 deaths.' },
  { year: 2010, month: 4, day: 14, title: 'Eyjafjallajökull', category: 'volcanoes', lat: 63.63, lng: -19.62, size: 'VEI 4', note: 'Its ash cloud grounded European air traffic for a week — the biggest closure since WWII.' },
  { year: 2011, month: 3, day: 11, title: 'Tōhoku earthquake & tsunami', category: 'earthquakes', lat: 38.3, lng: 142.37, size: 'M 9.1', note: 'It shifted Japan\'s coast by 2.4 m and shortened the day by 1.8 microseconds.' },
  { year: 2013, month: 2, day: 15, title: 'Chelyabinsk meteor', category: 'impact', lat: 54.8, lng: 61.1, size: '~500 kt airburst', note: 'A 20 m asteroid exploded over Russia, its shock wave shattering windows across a city.' },
  { year: 2013, month: 11, day: 8, title: 'Typhoon Haiyan', category: 'severeStorms', lat: 11.03, lng: 125.72, size: '315 km/h', note: 'One of the strongest tropical cyclones at landfall ever recorded, over the Philippines.' },
  { year: 2018, month: 11, day: 8, title: 'Camp Fire', category: 'wildfires', lat: 39.76, lng: -121.62, size: '620 km²', note: 'California\'s deadliest and most destructive wildfire; the town of Paradise was lost.' },
  { year: 2020, month: 1, day: 4, title: 'Black Summer bushfires', category: 'wildfires', lat: -36.7, lng: 149.9, size: '186,000 km²', note: 'Australia\'s catastrophic season burned an area larger than Syria, and its smoke circled the globe.' },
  { year: 2022, month: 1, day: 15, title: 'Hunga Tonga–Hunga Haʻapai', category: 'volcanoes', lat: -20.54, lng: -175.39, size: 'VEI 5–6', note: 'The strongest atmospheric blast of the satellite era — its shock wave circled the Earth several times.' },
  { year: 2023, month: 2, day: 6, title: 'Turkey–Syria earthquakes', category: 'earthquakes', lat: 37.22, lng: 37.02, size: 'M 7.8', note: 'A twin sequence on the East Anatolian Fault killed over 50,000 people.' },
]

/** UTC ms for a (possibly pre-100 AD) date — Date.UTC would map year 79 to 1979. */
function utcMs(year: number, month = 1, day = 1): number {
  const d = new Date(0)
  d.setUTCFullYear(year, month - 1, day)
  d.setUTCHours(12, 0, 0, 0)
  return d.getTime()
}

/** The chronology, oldest first. */
export const HISTORIC_EVENTS: EarthEvent[] = H.map((h) => ({
  id: `hist-${h.year}-${h.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  title: h.title,
  category: h.category,
  lat: h.lat,
  lng: h.lng,
  date: utcMs(h.year, h.month, h.day),
  magnitudeLabel: h.size,
  note: h.note,
  source: 'curated · USGS / Smithsonian GVP / NOAA',
  historic: true,
})).sort((a, b) => a.date - b.date)

export function yearOf(e: Pick<EarthEvent, 'date'>): number {
  return new Date(e.date).getUTCFullYear()
}

/** The first `count` events of the chronology (what the globe shows at that point). */
export function historyUpTo(count: number): EarthEvent[] {
  return HISTORIC_EVENTS.slice(0, Math.max(0, Math.min(HISTORIC_EVENTS.length, Math.floor(count))))
}
