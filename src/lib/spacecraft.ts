/** A census of the robotic spacecraft currently exploring the Solar System
 * beyond Earth orbit (mid-2026). "Active" = operating, in cruise, or in a
 * planned hibernation; dead/terminated craft are left out. The boundary is
 * fuzzy (the Sun–Earth L1/L2 fleet is deliberately excluded), so this is a
 * defensible headline count, not a contested one — the list is the source of
 * truth so the number stays honest and auditable. */

export interface Spacecraft {
  name: string
  operator: string
  /** Where it works now. */
  region: 'Sun' | 'Mercury' | 'Moon' | 'Mars' | 'Jupiter' | 'small bodies' | 'interstellar'
  /** operating = on station & returning science; cruise = en route; dormant = planned hibernation. */
  status: 'operating' | 'cruise' | 'dormant'
}

export const SOLAR_SYSTEM_SPACECRAFT: Spacecraft[] = [
  // ☀️ heliophysics (truly heliocentric — the L1/L2 fleet is excluded)
  { name: 'Parker Solar Probe', operator: 'NASA', region: 'Sun', status: 'operating' },
  { name: 'Solar Orbiter', operator: 'ESA', region: 'Sun', status: 'operating' },
  { name: 'STEREO-A', operator: 'NASA', region: 'Sun', status: 'operating' },
  // ☿ Mercury
  { name: 'BepiColombo', operator: 'ESA/JAXA', region: 'Mercury', status: 'cruise' },
  // 🌙 the Moon
  { name: 'Lunar Reconnaissance Orbiter', operator: 'NASA', region: 'Moon', status: 'operating' },
  { name: 'CAPSTONE', operator: 'NASA', region: 'Moon', status: 'operating' },
  { name: 'Chandrayaan-2 Orbiter', operator: 'ISRO', region: 'Moon', status: 'operating' },
  { name: 'Danuri (KPLO)', operator: 'KARI', region: 'Moon', status: 'operating' },
  { name: 'Queqiao-2', operator: 'CNSA', region: 'Moon', status: 'operating' },
  { name: 'ARTEMIS P1', operator: 'NASA', region: 'Moon', status: 'operating' },
  { name: 'ARTEMIS P2', operator: 'NASA', region: 'Moon', status: 'operating' },
  { name: 'Tiandu-1', operator: 'CNSA', region: 'Moon', status: 'operating' },
  { name: 'Tiandu-2', operator: 'CNSA', region: 'Moon', status: 'operating' },
  { name: "Chang'e 4 lander", operator: 'CNSA', region: 'Moon', status: 'operating' },
  { name: 'Yutu-2 rover', operator: 'CNSA', region: 'Moon', status: 'dormant' },
  // ♂ Mars
  { name: 'Mars Odyssey', operator: 'NASA', region: 'Mars', status: 'operating' },
  { name: 'Mars Reconnaissance Orbiter', operator: 'NASA', region: 'Mars', status: 'operating' },
  { name: 'Mars Express', operator: 'ESA', region: 'Mars', status: 'operating' },
  { name: 'Trace Gas Orbiter', operator: 'ESA', region: 'Mars', status: 'operating' },
  { name: 'Hope', operator: 'UAE', region: 'Mars', status: 'operating' },
  { name: 'Tianwen-1', operator: 'CNSA', region: 'Mars', status: 'operating' },
  { name: 'Curiosity', operator: 'NASA', region: 'Mars', status: 'operating' },
  { name: 'Perseverance', operator: 'NASA', region: 'Mars', status: 'operating' },
  // ♃ Jupiter (Juno on station; two big missions inbound)
  { name: 'Juno', operator: 'NASA', region: 'Jupiter', status: 'operating' },
  { name: 'JUICE', operator: 'ESA', region: 'Jupiter', status: 'cruise' },
  { name: 'Europa Clipper', operator: 'NASA', region: 'Jupiter', status: 'cruise' },
  // ☄️ asteroids & comets
  { name: 'Lucy', operator: 'NASA', region: 'small bodies', status: 'cruise' },
  { name: 'Psyche', operator: 'NASA', region: 'small bodies', status: 'cruise' },
  { name: 'Hayabusa2#', operator: 'JAXA', region: 'small bodies', status: 'cruise' },
  { name: 'OSIRIS-APEX', operator: 'NASA', region: 'small bodies', status: 'cruise' },
  { name: 'Hera', operator: 'ESA', region: 'small bodies', status: 'cruise' },
  { name: 'Tianwen-2', operator: 'CNSA', region: 'small bodies', status: 'operating' },
  // 🌌 the edge of the Solar System
  { name: 'Voyager 1', operator: 'NASA', region: 'interstellar', status: 'operating' },
  { name: 'Voyager 2', operator: 'NASA', region: 'interstellar', status: 'operating' },
  { name: 'New Horizons', operator: 'NASA', region: 'interstellar', status: 'dormant' },
]

/** Headline count for the HUD — derived so it can never drift from the list. */
export const ACTIVE_SPACECRAFT_COUNT = SOLAR_SYSTEM_SPACECRAFT.length
