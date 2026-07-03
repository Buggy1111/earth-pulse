/** Planet realism effects, all procedural:
 *
 * Ring shadow — the planet casts a real shadow across its rings (the single
 * biggest realism cue on Saturn). The fragment shader runs a cylinder test:
 * a ring point is shadowed when it lies behind the planet w.r.t. the Sun and
 * within one planet radius of the shadow axis. The planet centre comes free
 * from `modelMatrix` (ring origin = planet centre), the Sun position is a
 * shared uniform updated once per frame.
 *
 * Atmosphere — additive fresnel rim on a slightly larger BackSide shell:
 * a soft coloured halo hugging the limb (thick on Venus, thin on Mars).
 */

import * as THREE from 'three'
import { NOISE_GLSL } from './sunMaterial'

const RING_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vCenter;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const RING_FRAG = /* glsl */ `
uniform vec3 uSunPos;
uniform float uPlanetRadius;
uniform vec3 uColor;
uniform float uOpacity;
uniform sampler2D uMap;
uniform float uHasMap;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vCenter;

void main() {
  vec4 base = uHasMap > 0.5
    ? texture2D(uMap, vUv)
    : vec4(uColor, 1.0);
  float alpha = base.a * uOpacity;
  if (alpha < 0.003) discard;

  // válec stínu: za planetou vůči Slunci a do 1 poloměru od osy stínu
  vec3 sunDir = normalize(vCenter - uSunPos); // směr Slunce -> planeta
  vec3 v = vWorld - vCenter;                  // střed planety -> bod prstence
  float along = dot(v, sunDir);               // >0 = za planetou
  vec3 lateralVec = v - sunDir * along;
  float lateral = length(lateralVec);
  float shadow = along > 0.0
    ? 1.0 - smoothstep(uPlanetRadius * 0.92, uPlanetRadius * 1.05, lateral)
    : 0.0;

  vec3 col = base.rgb * (1.0 - 0.82 * shadow);
  gl_FragColor = vec4(col, alpha);
}
`

/** One shared Sun-position vector — frame loop updates it once, every ring
 * material reads it (same Vector3 instance inside every uniforms object). */
export function makeRingShadowMaterial(
  sunPos: THREE.Vector3,
  planetRadius: number,
  color: string,
  opacity: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunPos: { value: sunPos },
      uPlanetRadius: { value: planetRadius },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uMap: { value: null },
      uHasMap: { value: 0 },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  })
}

const ATMO_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vViewPos;
void main() {
  // BackSide slupka: svítí jen tenký srpek za limbem planety
  vec3 viewDir = normalize(-vViewPos);
  float rim = pow(clamp(1.0 + dot(viewDir, normalize(vNormal)), 0.0, 1.0), uPower);
  gl_FragColor = vec4(uColor, 1.0) * rim * uIntensity;
}
`

export function makeAtmosphereMaterial(
  color: string,
  power = 3.5,
  intensity = 0.9,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    },
    vertexShader: ATMO_VERT,
    fragmentShader: ATMO_FRAG,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

const BANDS_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vObj = normalize(position);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const BANDS_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunPos;
uniform vec3 uTint;
uniform float uFreq;
uniform float uStrength;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
` + NOISE_GLSL + /* glsl */ `
void main() {
  // pásy podle šířky (vObj.y = osa pólů) + turbulence tekoucí podél rovnoběžek —
  // rychlosti zvolené tak, aby proudění bylo VIDĚT během pár vteřin dívání
  float turb = fbm(vObj * 3.0 + vec3(uTime * 0.07, 0.0, uTime * 0.045));
  float flow = fbm(vec3(vObj.y * uFreq * 0.35, atan(vObj.z, vObj.x) * 2.0 - uTime * 0.14, uTime * 0.03));
  float band = sin(vObj.y * uFreq + turb * 2.8 + uTime * 0.02) * 0.5 + 0.5;
  float a = smoothstep(0.5, 0.95, band) * (0.35 + 0.65 * flow) * uStrength;

  // víry mezi pásy: druhá vrstva šumu proti směru, zjasňuje okraje pásů
  float eddy = fbm(vObj * 7.0 + vec3(-uTime * 0.05, uTime * 0.02, 0.0));
  a += smoothstep(0.45, 0.55, band) * smoothstep(0.55, 0.45, band) * eddy * uStrength * 0.8;

  // jen na denní straně — pásy jsou odražené světlo, ne vlastní záře
  float day = clamp(dot(normalize(vNormalW), normalize(uSunPos - vWorld)), 0.0, 1.0);
  a *= 0.15 + 0.85 * day;

  gl_FragColor = vec4(uTint, a);
}
`

/** Living cloud-band flow for the gas giants — a whisper-thin overlay riding
 * the spinning planet mesh; the noise inside the bands drifts in real time. */
export function makeBandsMaterial(
  sunPos: THREE.Vector3,
  color: string,
  freq: number,
  strength: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunPos: { value: sunPos },
      uTint: { value: new THREE.Color(color) },
      uFreq: { value: freq },
      uStrength: { value: strength },
    },
    vertexShader: BANDS_VERT,
    fragmentShader: BANDS_FRAG,
    transparent: true,
    depthWrite: false,
  })
}

/** Which worlds get flowing cloud bands and how strong (Jupiter loudest;
 * Venus = slow zonal haze over its cloud deck — super-rotating atmosphere). */
export const BANDS: Record<string, { color: string; freq: number; strength: number }> = {
  venus: { color: '#f0e2b8', freq: 5, strength: 0.22 },
  jupiter: { color: '#eed8b0', freq: 22, strength: 0.32 },
  saturn: { color: '#eee0bc', freq: 16, strength: 0.22 },
  uranus: { color: '#d0f0f5', freq: 8, strength: 0.15 },
  neptune: { color: '#b4d2ff', freq: 10, strength: 0.2 },
}

const STORMS_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  vObj = normalize(position);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const STORMS_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunPos;
uniform vec4 uSpot;        // xyz = směr středu bouře (object space), w = úhlový poloměr
uniform vec4 uSpotColor;   // rgb + strength (0 = vypnuto)
uniform float uSpotSwirl;  // rychlost rotace víru
uniform vec4 uHex;         // x = strength, y = úhlová velikost od pólu, z/w = nevyužito
uniform vec3 uHexColor;
uniform vec4 uStreaks;     // x = strength, y = rychlost, z = šířková frekvence
uniform vec3 uStreakColor;
uniform vec4 uDust;        // x = strength, y = rychlost cyklu bouří
uniform vec3 uDustColor;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
` + NOISE_GLSL + /* glsl */ `
void main() {
  vec3 col = vec3(0.0);
  float a = 0.0;

  // 🌀 VELKÁ SKVRNA (Jupiter GRS / Neptunova tmavá) — rotující vír kolem
  // pevného bodu na povrchu; sedí na skvrně v textuře (změřeno z bitmapy)
  if (uSpotColor.a > 0.0) {
    float d = acos(clamp(dot(vObj, normalize(uSpot.xyz)), -1.0, 1.0));
    if (d < uSpot.w) {
      // lokální souřadnice kolem středu skvrny + rotace úměrná blízkosti středu
      vec3 e1 = normalize(cross(uSpot.xyz, vec3(0.0, 1.0, 0.0)));
      vec3 e2 = normalize(cross(normalize(uSpot.xyz), e1));
      vec2 p = vec2(dot(vObj, e1), dot(vObj, e2)) / uSpot.w;
      float r = length(p);
      float ang = atan(p.y, p.x) + (1.0 - r) * uTime * uSpotSwirl;
      vec2 q = vec2(cos(ang), sin(ang)) * r;
      float swirl = fbm(vec3(q * 3.0, uTime * 0.05));
      float core = smoothstep(1.0, 0.25, r);
      a += core * (0.45 + 0.5 * swirl) * uSpotColor.a;
      col = mix(col, uSpotColor.rgb, 1.0);
    }
  }

  // ⬡ ŠESTIÚHELNÍK (Saturnův polární hurikán) — hranice v polárních
  // souřadnicích kolem severního pólu (+Y objektu) + vír uvnitř
  if (uHex.x > 0.0) {
    float colat = acos(clamp(vObj.y, -1.0, 1.0));   // úhel od severního pólu
    if (colat < uHex.y * 1.6) {
      float phi = atan(vObj.z, vObj.x);
      // poloměr hranice šestiúhelníku pro daný azimut (rotuje zvolna jako reálný)
      float sector = mod(phi + uTime * 0.01, 1.0471975512) - 0.5235987756; // 60° výseče
      float hexR = uHex.y / cos(sector);
      float edge = smoothstep(0.055, 0.0, abs(colat - hexR));
      float inner = smoothstep(uHex.y, uHex.y * 0.2, colat)
                  * (0.35 + 0.65 * fbm(vec3(vObj.x, vObj.z, 0.3) * 9.0
                        + vec3(uTime * 0.04, -uTime * 0.03, 0.0)));
      float h = (edge * 0.9 + inner * 0.45) * uHex.x;
      a += h;
      col = mix(col, uHexColor, clamp(h * 2.0, 0.0, 1.0));
    }
  }

  // 💨 RYCHLÉ PRUHY (Neptunovy cirry, 2100 km/h) — jasné tenké šmouhy
  // sprintující podél rovnoběžek znatelně rychleji než pásy
  if (uStreaks.x > 0.0) {
    float lat = vObj.y;
    float lon = atan(vObj.z, vObj.x);
    float s = fbm(vec3(lat * uStreaks.z, lon * 2.5 - uTime * uStreaks.y, uTime * 0.07));
    float streak = smoothstep(0.62, 0.85, s) * uStreaks.x;
    a += streak;
    col = mix(col, uStreakColor, clamp(streak * 2.5, 0.0, 1.0));
  }

  // 🌪 PRACHOVÉ BOUŘE (Mars) — velkoplošný závoj, který se rodí a umírá
  // v pomalém cyklu (jako reálné regionální/globální bouře)
  if (uDust.x > 0.0) {
    float activity = smoothstep(0.45, 0.75, fbm(vec3(uTime * uDust.y, 3.7, 1.3)));
    float veil = fbm(vObj * 2.2 + vec3(uTime * 0.015, 0.0, uTime * 0.01));
    float dust = activity * smoothstep(0.35, 0.8, veil) * uDust.x;
    a += dust;
    col = mix(col, uDustColor, clamp(dust * 2.0, 0.0, 1.0));
  }

  // jevy jsou odražené světlo — na noční straně skoro zhasnou
  float day = clamp(dot(normalize(vNormalW), normalize(uSunPos - vWorld)), 0.0, 1.0);
  a *= 0.12 + 0.88 * day;

  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
}
`

export interface StormConfig {
  spot?: { latDeg: number; lonDeg: number; radiusRad: number; color: string; strength: number; swirl: number }
  hex?: { sizeRad: number; color: string; strength: number }
  streaks?: { color: string; strength: number; speed: number; latFreq: number }
  dust?: { color: string; strength: number; cycleSpeed: number }
}

/** Object-space direction of a texture lat/lon on a THREE SphereGeometry
 * (u wraps around +Y; matches the equirectangular planet maps). */
export function sphereDir(latDeg: number, lonDeg: number): THREE.Vector3 {
  const theta = ((90 - latDeg) * Math.PI) / 180
  const phi = (((lonDeg + 180) / 360) * Math.PI * 2)
  return new THREE.Vector3(
    -Math.cos(phi) * Math.sin(theta),
    Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
  ).normalize()
}

export function makeStormsMaterial(sunPos: THREE.Vector3, cfg: StormConfig): THREE.ShaderMaterial {
  const spotDir = cfg.spot ? sphereDir(cfg.spot.latDeg, cfg.spot.lonDeg) : new THREE.Vector3(0, 1, 0)
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSunPos: { value: sunPos },
      uSpot: { value: new THREE.Vector4(spotDir.x, spotDir.y, spotDir.z, cfg.spot?.radiusRad ?? 0) },
      uSpotColor: { value: new THREE.Vector4(...new THREE.Color(cfg.spot?.color ?? '#ffffff').toArray(), cfg.spot?.strength ?? 0) },
      uSpotSwirl: { value: cfg.spot?.swirl ?? 0 },
      uHex: { value: new THREE.Vector4(cfg.hex?.strength ?? 0, cfg.hex?.sizeRad ?? 0.2, 0, 0) },
      uHexColor: { value: new THREE.Color(cfg.hex?.color ?? '#ffffff') },
      uStreaks: { value: new THREE.Vector4(cfg.streaks?.strength ?? 0, cfg.streaks?.speed ?? 0, cfg.streaks?.latFreq ?? 8, 0) },
      uStreakColor: { value: new THREE.Color(cfg.streaks?.color ?? '#ffffff') },
      uDust: { value: new THREE.Vector4(cfg.dust?.strength ?? 0, cfg.dust?.cycleSpeed ?? 0.004, 0, 0) },
      uDustColor: { value: new THREE.Color(cfg.dust?.color ?? '#ffffff') },
    },
    vertexShader: STORMS_VERT,
    fragmentShader: STORMS_FRAG,
    transparent: true,
    depthWrite: false,
  })
}

/** Signature weather per planet — real phenomena, NASA-documented:
 * Jupiter's Great Red Spot (texture-aligned at lat −20°, lon −46°, measured
 * from the bitmap), Saturn's north-polar hexagon, Neptune's supersonic
 * cirrus + dark vortex, Mars' come-and-go dust storms. */
export const STORMS: Record<string, StormConfig> = {
  jupiter: {
    spot: { latDeg: -20, lonDeg: -46, radiusRad: 0.15, color: '#b8442e', strength: 0.6, swirl: 0.4 },
  },
  saturn: {
    hex: { sizeRad: 0.24, color: '#caa96e', strength: 0.55 },
  },
  neptune: {
    streaks: { color: '#e6f0ff', strength: 0.4, speed: 0.6, latFreq: 9 },
    spot: { latDeg: -28, lonDeg: 40, radiusRad: 0.17, color: '#16255e', strength: 0.5, swirl: 0.25 },
  },
  mars: {
    dust: { color: '#d8a878', strength: 0.5, cycleSpeed: 0.004 },
  },
  uranus: {
    streaks: { color: '#e8fbff', strength: 0.14, speed: 0.25, latFreq: 6 },
  },
}

/** Deterministic 3D value noise for the potato moons (no deps, seedable). */
function potatoNoise(x: number, y: number, z: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 53.3) * 43758.5453
  return s - Math.floor(s)
}

/** Cratered potato geometry for moons too small to be round (Phobos, Deimos):
 * an ellipsoid with layered noise lumps and a few scooped craters — matches
 * the NASA imagery far better than a smooth sphere. Deterministic per seed. */
export function makeIrregularMoonGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, 28, 28)
  const pos = geo.attributes.position

  // pár velkých kráterů na náhodných (seedovaných) směrech — Stickney na Phobosu
  const craters: { dir: THREE.Vector3; size: number; depth: number }[] = []
  for (let c = 0; c < 4; c++) {
    const u = potatoNoise(c + 1, seed, 0.7, seed) * 2 - 1
    const t = potatoNoise(0.3, c + 2, seed, seed) * Math.PI * 2
    const r = Math.sqrt(Math.max(0, 1 - u * u))
    craters.push({
      dir: new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t)).normalize(),
      size: 0.35 + 0.3 * potatoNoise(c, 0.5, seed, seed), // úhlová velikost (rad-ish)
      depth: 0.1 + 0.1 * potatoNoise(seed, c, 1.1, seed),
    })
  }

  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    // elipsoid (brambora, ne koule) + dvě oktávy hrud
    let f = 1
    f *= 1 + 0.14 * (potatoNoise(v.x * 2.1, v.y * 2.1, v.z * 2.1, seed) - 0.5) * 2
    f *= 1 + 0.07 * (potatoNoise(v.x * 5.3, v.y * 5.3, v.z * 5.3, seed + 9) - 0.5) * 2
    for (const c of craters) {
      const ang = v.angleTo(c.dir)
      if (ang < c.size) f -= c.depth * (Math.cos((ang / c.size) * Math.PI) * 0.5 + 0.5)
    }
    const rr = radius * f
    pos.setXYZ(i, v.x * rr * 1.25, v.y * rr * 0.92, v.z * rr * 0.82)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** Per-planet atmosphere looks — thickness/colour roughly matches reality
 * (dense sulfuric Venus, whisper-thin dusty Mars, hazy giants). */
export const ATMOSPHERES: Record<string, { color: string; power: number; intensity: number }> = {
  venus: { color: '#e8d8a0', power: 2.6, intensity: 1.1 },
  mars: { color: '#d89a70', power: 4.5, intensity: 0.45 },
  jupiter: { color: '#d8c8a8', power: 3.4, intensity: 0.55 },
  saturn: { color: '#e6d8b0', power: 3.4, intensity: 0.5 },
  uranus: { color: '#9fd8e0', power: 3.2, intensity: 0.6 },
  neptune: { color: '#7aa8ea', power: 3.2, intensity: 0.65 },
}
