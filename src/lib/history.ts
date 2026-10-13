/** 🏛 History of the planet: the events that shaped (or shook) the Earth, as a
 * hand-curated chronology shown on the globe. They reuse the live-event shape
 * (EarthEvent) so the existing event pins, rings and detail card render them
 * unchanged — History mode just swaps the data underneath.
 *
 * Natural disasters, nuclear and industrial accidents and spaceflight milestones.
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
  { year: 1986, month: 4, day: 26, title: 'Chernobyl disaster', category: 'nuclear', lat: 51.389, lng: 30.099, size: 'INES 7', note: 'The worst nuclear accident in history; a radioactive plume reached across Europe.' },
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
  { year: 1912, month: 4, day: 15, title: 'Titanic sinks', category: 'manmade', lat: 41.7325, lng: -49.9469, size: '~1,500 lives', note: 'The "unsinkable" liner struck an iceberg on her maiden voyage; the disaster rewrote maritime safety law.' },
  { year: 1917, month: 12, day: 6, title: 'Halifax explosion', category: 'manmade', lat: 44.669, lng: -63.606, size: '~2.9 kt', note: 'A munitions ship blew up in the harbour — the largest man-made blast before the atomic bomb.' },
  { year: 1920, month: 12, day: 16, title: 'Haiyuan earthquake', category: 'earthquakes', lat: 36.6, lng: 105.3, size: 'M 7.8', note: 'Landslides buried whole villages in China\'s loess hills; some 200,000 died.' },
  { year: 1923, month: 9, day: 1, title: 'Great Kantō earthquake', category: 'earthquakes', lat: 35.33, lng: 139.13, size: 'M 7.9', note: 'Quake and firestorms destroyed much of Tokyo and Yokohama; over 100,000 died.' },
  { year: 1931, month: 7, day: 15, title: 'China floods', category: 'floods', lat: 30.6, lng: 114.3, size: 'up to millions', note: 'The Yangtze and Huai burst their banks — among the deadliest natural disasters ever recorded.' },
  { year: 1937, month: 5, day: 6, title: 'Hindenburg disaster', category: 'manmade', lat: 40.03, lng: -74.32, size: '36 lives', note: 'The giant airship burst into flames while landing in New Jersey — and ended the age of airships.' },
  { year: 1945, month: 7, day: 16, title: 'Trinity test', category: 'nuclear', lat: 33.6773, lng: -106.4754, size: '~25 kt', note: 'The first nuclear explosion, in the New Mexico desert, opened the atomic age.' },
  { year: 1945, month: 8, day: 6, title: 'Hiroshima', category: 'nuclear', lat: 34.3955, lng: 132.4536, size: '~15 kt', note: 'The first atomic bomb used in war destroyed the city; about 140,000 died by the end of 1945.' },
  { year: 1945, month: 8, day: 9, title: 'Nagasaki', category: 'nuclear', lat: 32.7737, lng: 129.8633, size: '~21 kt', note: 'The second — and so far last — nuclear weapon used in war; some 70,000 died.' },
  { year: 1947, month: 2, day: 12, title: 'Sikhote-Alin meteorite', category: 'impact', lat: 46.16, lng: 134.65, size: '~23 t of iron', note: 'An iron asteroid broke up over the Russian Far East, raining fragments and blasting over 100 craters.' },
  { year: 1952, month: 12, day: 5, title: 'Great Smog of London', category: 'manmade', lat: 51.507, lng: -0.128, size: '~12,000 deaths', note: 'Coal smoke trapped under cold air blacked out London for five days — and led to the Clean Air Act.' },
  { year: 1954, month: 3, day: 1, title: 'Castle Bravo', category: 'nuclear', lat: 11.69, lng: 165.27, size: '15 Mt', note: 'The largest US nuclear test, at Bikini Atoll, ran wild at 2.5× its design yield and spread fallout far beyond.' },
  { year: 1957, month: 9, day: 29, title: 'Kyshtym disaster', category: 'nuclear', lat: 55.71, lng: 60.85, size: 'INES 6', note: 'A waste tank exploded at the secret Mayak plant in the Urals — kept hidden by the USSR for decades.' },
  { year: 1957, month: 10, day: 4, title: 'Sputnik 1', category: 'space', lat: 45.965, lng: 63.305, size: 'first satellite', note: 'The first artificial satellite beeped its way around the Earth — and started the Space Age.' },
  { year: 1961, month: 4, day: 12, title: 'Gagarin — first human in space', category: 'space', lat: 45.92, lng: 63.342, size: '108 min', note: 'Yuri Gagarin orbited the Earth once in Vostok 1, launched from Baikonur.' },
  { year: 1961, month: 10, day: 30, title: 'Tsar Bomba', category: 'nuclear', lat: 73.81, lng: 54.58, size: '50 Mt', note: 'The most powerful explosion ever made by humans, over Novaya Zemlya; its shock wave circled the Earth three times.' },
  { year: 1969, month: 7, day: 16, title: 'Apollo 11 launch', category: 'space', lat: 28.608, lng: -80.604, size: 'Saturn V', note: 'Four days after lift-off from Florida, Armstrong and Aldrin walked on the Moon.' },
  { year: 1976, month: 7, day: 28, title: 'Tangshan earthquake', category: 'earthquakes', lat: 39.63, lng: 118.18, size: 'M 7.6', note: 'An industrial city of a million levelled before dawn; at least 240,000 died.' },
  { year: 1979, month: 3, day: 28, title: 'Three Mile Island', category: 'nuclear', lat: 40.153, lng: -76.725, size: 'INES 5', note: 'A partial meltdown in Pennsylvania — the worst US nuclear accident, which froze new reactor building for decades.' },
  { year: 1984, month: 12, day: 3, title: 'Bhopal gas tragedy', category: 'manmade', lat: 23.28, lng: 77.41, size: 'MIC gas leak', note: 'A pesticide plant leaked toxic gas over a sleeping city — the world\'s worst industrial disaster, with thousands dead.' },
  { year: 1985, month: 9, day: 19, title: 'Mexico City earthquake', category: 'earthquakes', lat: 18.19, lng: -102.53, size: 'M 8.0', note: 'The old lake bed under the capital amplified the shaking 400 km from the epicentre; thousands of buildings fell.' },
  { year: 1985, month: 11, day: 13, title: 'Nevado del Ruiz — Armero', category: 'volcanoes', lat: 4.895, lng: -75.322, size: 'VEI 3', note: 'A small eruption melted glacier ice; mudflows buried the town of Armero and 23,000 people.' },
  { year: 1986, month: 1, day: 28, title: 'Challenger disaster', category: 'space', lat: 28.64, lng: -80.28, size: '73 s', note: 'The Space Shuttle broke apart 73 seconds after launch, killing all seven crew.' },
  { year: 1989, month: 3, day: 13, title: 'Québec geomagnetic storm', category: 'solarStorm', lat: 46.8, lng: -71.2, size: 'G5 storm', note: 'A solar storm collapsed Hydro-Québec\'s grid in 90 seconds, leaving six million people without power.' },
  { year: 1989, month: 3, day: 24, title: 'Exxon Valdez oil spill', category: 'manmade', lat: 60.84, lng: -146.86, size: '~41,000 m³ oil', note: 'A tanker ran aground in Prince William Sound, coating 2,000 km of Alaskan coast in crude.' },
  { year: 1991, month: 2, day: 22, title: 'Kuwait oil fires', category: 'manmade', lat: 29.0, lng: 47.7, size: '~600 wells', note: 'Retreating Iraqi forces set the oil fields ablaze; smoke darkened the Gulf sky for ten months.' },
  { year: 1991, month: 4, day: 29, title: 'Bangladesh cyclone', category: 'severeStorms', lat: 22.3, lng: 91.8, size: '~140,000 deaths', note: 'A 6 m storm surge swept the Chittagong coast in the night.' },
  { year: 1995, month: 1, day: 17, title: 'Great Hanshin (Kobe) earthquake', category: 'earthquakes', lat: 34.59, lng: 135.07, size: 'M 6.9', note: 'A fault under Kobe toppled elevated highways and burned whole districts; 6,400 died.' },
  { year: 1997, month: 7, day: 7, title: 'Moravian floods', category: 'floods', lat: 49.6, lng: 17.8, size: 'Morava & Odra', note: 'The "flood of the century" in Moravia and Silesia: 50 died and a third of the Czech Republic was hit.' },
  { year: 1999, month: 8, day: 17, title: 'İzmit earthquake', category: 'earthquakes', lat: 40.76, lng: 29.97, size: 'M 7.6', note: 'The North Anatolian Fault tore through Turkey\'s industrial heartland; some 17,000 died.' },
  { year: 2002, month: 8, day: 13, title: 'Central European floods', category: 'floods', lat: 50.08, lng: 14.42, size: 'Vltava 5,160 m³/s', note: 'The Vltava flooded Prague\'s metro and Old Town; the Elbe and Danube broke records across Central Europe.' },
  { year: 2003, month: 2, day: 1, title: 'Columbia disaster', category: 'space', lat: 31.34, lng: -93.85, size: 're-entry', note: 'The Space Shuttle disintegrated over Texas on its return; all seven astronauts died.' },
  { year: 2003, month: 8, day: 10, title: 'European heatwave', category: 'tempExtremes', lat: 46.6, lng: 2.5, size: '~70,000 deaths', note: 'The hottest summer in 500 years; France alone lost 15,000 people in two weeks.' },
  { year: 2008, month: 5, day: 2, title: 'Cyclone Nargis', category: 'severeStorms', lat: 16.0, lng: 94.6, size: '~138,000 deaths', note: 'A storm surge drowned the Irrawaddy delta in Myanmar.' },
  { year: 2008, month: 5, day: 12, title: 'Sichuan earthquake', category: 'earthquakes', lat: 31.0, lng: 103.4, size: 'M 7.9', note: 'Some 70,000 died, many children in collapsed schools.' },
  { year: 2010, month: 4, day: 20, title: 'Deepwater Horizon', category: 'manmade', lat: 28.736, lng: -88.387, size: '~780,000 m³ oil', note: 'An offshore rig exploded in the Gulf of Mexico — the largest marine oil spill in history.' },
  { year: 2011, month: 3, day: 12, title: 'Fukushima Daiichi', category: 'nuclear', lat: 37.4211, lng: 141.0328, size: 'INES 7', note: 'The tsunami knocked out cooling; three reactors melted down and hydrogen blasts tore open their buildings.' },
  { year: 2015, month: 4, day: 25, title: 'Nepal earthquake', category: 'earthquakes', lat: 28.23, lng: 84.73, size: 'M 7.8', note: 'Kathmandu\'s temples fell and an avalanche swept Everest base camp; nearly 9,000 died.' },
  { year: 2018, month: 9, day: 28, title: 'Sulawesi earthquake & tsunami', category: 'earthquakes', lat: -0.18, lng: 119.84, size: 'M 7.5', note: 'A tsunami and soil liquefaction swallowed whole neighbourhoods of Palu.' },
  { year: 2020, month: 8, day: 4, title: 'Beirut explosion', category: 'manmade', lat: 33.901, lng: 35.519, size: '~1 kt', note: '2,750 t of ammonium nitrate detonated in the port, devastating half the city.' },
  { year: 2021, month: 7, day: 14, title: 'European floods', category: 'floods', lat: 50.5, lng: 7.0, size: '~240 deaths', note: 'Torrential rain turned the Ahr and other valleys in Germany and Belgium into torrents overnight.' },
]

/** UTC ms for a (possibly pre-100 AD) date — Date.UTC would map year 79 to 1979. */
function utcMs(year: number, month = 1, day = 1): number {
  const d = new Date(0)
  d.setUTCFullYear(year, month - 1, day)
  d.setUTCHours(12, 0, 0, 0)
  return d.getTime()
}

// the curated card cites who the figures come from — per event family, so a
// Titanic or an Apollo card doesn't claim USGS as its source
const SOURCE: Record<string, string> = {
  nuclear: 'curated · IAEA / historical records',
  manmade: 'curated · historical records',
  space: 'curated · NASA / Roscosmos records',
  impact: 'curated · NASA / historical records',
}
const DEFAULT_SOURCE = 'curated · USGS / Smithsonian GVP / NOAA'

// Verified event-specific primary sources. Other entries retain their existing
// category attribution until a source covering their particular claims is checked.
const PRIMARY_SOURCES: Record<string, { source: string; link: string }> = {
  'Apollo 11 launch': { source: 'NASA · Apollo 11 Mission Overview', link: 'https://www.nasa.gov/history/apollo-11-mission-overview/' },
  'Great Chilean earthquake': { source: 'USGS · Earthquake Facts', link: 'https://pubs.usgs.gov/circ/c1187/c1187.pdf' },
  'Galveston hurricane': { source: 'NOAA / NWS · Hurricane History', link: 'https://www.nhc.noaa.gov/outreach/history/' },
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
  source: PRIMARY_SOURCES[h.title]?.source ?? SOURCE[h.category] ?? DEFAULT_SOURCE,
  link: PRIMARY_SOURCES[h.title]?.link,
  historic: true,
})).sort((a, b) => a.date - b.date)

export function yearOf(e: Pick<EarthEvent, 'date'>): number {
  return new Date(e.date).getUTCFullYear()
}

/** The first `count` events of the chronology (what the globe shows at that point). */
export function historyUpTo(count: number): EarthEvent[] {
  return HISTORIC_EVENTS.slice(0, Math.max(0, Math.min(HISTORIC_EVENTS.length, Math.floor(count))))
}
