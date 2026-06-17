/** Encyclopedic facts for the curated satellite cast — what each mission does,
 * who flies it and when it launched. Keyed by the friendly name in famous.txt.
 * Colours echo the orbit-line mission palette. */

export interface Mission {
  agency: string
  launched: number
  /** One-line "what it watches". */
  measures: string
  /** A memorable fact. */
  fact: string
  /** Orbit at a glance: type · altitude · inclination. */
  orbit: string
  color: string
}

const CYAN = '#22d3ee'
const VIOLET = '#c084fc'
const ORANGE = '#fb923c'
const BLUE = '#38bdf8'
const GREEN = '#4ade80'
const GOLD = '#fbbf24'

export const SAT_MISSIONS: Record<string, Mission> = {
  ISS: { agency: 'NASA · Roscosmos · ESA · JAXA · CSA', launched: 1998, measures: 'humanity’s crewed lab in low orbit', fact: 'the most expensive object ever built — circles Earth every 90 minutes', orbit: 'low Earth orbit · 420 km · 51.6°', color: CYAN },
  Tiangong: { agency: 'CNSA (China)', launched: 2021, measures: 'China’s crewed space station', fact: 'name means “Heavenly Palace”; permanently crewed since 2022', orbit: 'low Earth orbit · 390 km · 41.5°', color: CYAN },
  Hubble: { agency: 'NASA · ESA', launched: 1990, measures: 'the deep universe in visible & UV light', fact: 'over 1.6 million observations — still going after 35+ years', orbit: 'low Earth orbit · 535 km · 28.5°', color: VIOLET },
  Fermi: { agency: 'NASA', launched: 2008, measures: 'the gamma-ray sky — black holes & pulsars', fact: 'scans the entire sky every 3 hours for cosmic explosions', orbit: 'low Earth orbit · 535 km · 25.6°', color: VIOLET },
  Terra: { agency: 'NASA', launched: 1999, measures: 'land, oceans & atmosphere (MODIS)', fact: 'the flagship that started NASA’s Earth Observing System', orbit: 'sun-synchronous · 705 km · 98.2°', color: GREEN },
  Aqua: { agency: 'NASA', launched: 2002, measures: 'Earth’s water cycle — clouds & rain', fact: 'named for the water it studies; flies in the “A-Train” constellation', orbit: 'sun-synchronous · 705 km · 98.2°', color: GOLD },
  Aura: { agency: 'NASA', launched: 2004, measures: 'atmospheric chemistry — ozone & air quality', fact: 'tracks the ozone hole and global pollution', orbit: 'sun-synchronous · 705 km · 98.2°', color: GOLD },
  'Suomi NPP': { agency: 'NASA · NOAA', launched: 2011, measures: 'weather & climate, day-night imagery', fact: 'its VIIRS camera takes the famous “Black Marble” night lights', orbit: 'sun-synchronous · 824 km · 98.7°', color: GOLD },
  'NOAA-20': { agency: 'NOAA · NASA', launched: 2017, measures: 'polar weather forecasting (JPSS-1)', fact: 'feeds the 3-7 day forecasts you check every morning', orbit: 'sun-synchronous · 824 km · 98.7°', color: ORANGE },
  'NOAA-21': { agency: 'NOAA · NASA', launched: 2022, measures: 'polar weather forecasting (JPSS-2)', fact: 'newest of the polar weather fleet', orbit: 'sun-synchronous · 824 km · 98.7°', color: ORANGE },
  'GOES-16': { agency: 'NOAA', launched: 2016, measures: 'geostationary weather over the Americas', fact: 'parks 35,786 km up and stares at one hemisphere nonstop', orbit: 'geostationary · 35,786 km · 0°', color: ORANGE },
  'GOES-18': { agency: 'NOAA', launched: 2022, measures: 'geostationary weather over the US West', fact: 'watches Pacific storms and wildfires in real time', orbit: 'geostationary · 35,786 km · 0°', color: ORANGE },
  'Landsat 8': { agency: 'NASA · USGS', launched: 2013, measures: 'land imaging — fields, forests, cities', fact: 'continues the longest continuous record of Earth’s land (since 1972)', orbit: 'sun-synchronous · 705 km · 98.2°', color: GREEN },
  'Landsat 9': { agency: 'NASA · USGS', launched: 2021, measures: 'land imaging continuity', fact: 'images the whole planet every 8 days with Landsat 8', orbit: 'sun-synchronous · 705 km · 98.2°', color: GREEN },
  'Sentinel-1A': { agency: 'ESA (Copernicus)', launched: 2014, measures: 'all-weather radar imaging', fact: 'sees through clouds and darkness — maps floods and ground shifts', orbit: 'sun-synchronous · 693 km · 98.2°', color: GREEN },
  'Sentinel-2A': { agency: 'ESA (Copernicus)', launched: 2015, measures: 'high-resolution optical land imaging', fact: 'free 10 m imagery powering agriculture and forestry worldwide', orbit: 'sun-synchronous · 786 km · 98.6°', color: GREEN },
  'Sentinel-2B': { agency: 'ESA (Copernicus)', launched: 2017, measures: 'high-resolution optical land imaging', fact: 'pairs with 2A for a 5-day global revisit', orbit: 'sun-synchronous · 786 km · 98.6°', color: GREEN },
  'Sentinel-3A': { agency: 'ESA (Copernicus)', launched: 2016, measures: 'ocean & land colour, temperature, height', fact: 'measures sea-surface temperature to a fraction of a degree', orbit: 'sun-synchronous · 815 km · 98.6°', color: BLUE },
  'Sentinel-6': { agency: 'ESA · NASA · NOAA · EUMETSAT', launched: 2020, measures: 'global sea-level rise', fact: 'the gold standard for tracking how fast oceans are rising', orbit: 'low Earth orbit · 1,336 km · 66°', color: BLUE },
  'Jason-3': { agency: 'NASA · NOAA · CNES · EUMETSAT', launched: 2016, measures: 'ocean surface topography & sea level', fact: 'radar altimeter accurate to a few centimetres from 1,300 km up', orbit: 'low Earth orbit · 1,336 km · 66°', color: BLUE },
  SWOT: { agency: 'NASA · CNES', launched: 2022, measures: 'surface water & ocean topography', fact: 'first to survey nearly all of Earth’s lakes, rivers and oceans', orbit: 'low Earth orbit · 891 km · 77.6°', color: BLUE },
  'ICESat-2': { agency: 'NASA', launched: 2018, measures: 'ice-sheet & sea-ice thickness (laser)', fact: 'fires 10,000 laser pulses a second to measure ice to the centimetre', orbit: 'near-polar · 496 km · 92°', color: GOLD },
  'GRACE-FO 1': { agency: 'NASA · GFZ', launched: 2018, measures: 'Earth’s water & ice mass via gravity', fact: 'twin satellites “weigh” aquifers and melting ice from orbit', orbit: 'near-polar · 490 km · 89°', color: BLUE },
  'OCO-2': { agency: 'NASA', launched: 2014, measures: 'atmospheric carbon dioxide', fact: 'maps where CO₂ is emitted and absorbed across the planet', orbit: 'sun-synchronous · 705 km · 98.2°', color: GOLD },
  'TanDEM-X': { agency: 'DLR (Germany)', launched: 2010, measures: '3-D radar elevation mapping', fact: 'built the first uniform 3-D elevation map of the entire globe', orbit: 'sun-synchronous · 514 km · 97.4°', color: GREEN },
  'GCOM-W1': { agency: 'JAXA (Japan)', launched: 2012, measures: 'the water cycle — soil moisture, sea temp', fact: 'nicknamed “Shizuku” (water droplet)', orbit: 'sun-synchronous · 700 km · 98.2°', color: GOLD },
}
