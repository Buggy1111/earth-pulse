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

const SPOKES_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;      // radiální mapování prstence (0 = vnitřek, 1 = vnějšek)
varying vec3 vLocal;   // pozice v rovině prstence
` + NOISE_GLSL + /* glsl */ `
void main() {
  float ang = atan(vLocal.y, vLocal.x);
  float r = vUv.x;
  // duchovité radiální klíny (Voyager "spokes") - rotují s prstencem,
  // rodí se a rozpadají během desítek sekund
  float w = fbm(vec3(ang * 5.0 - uTime * 0.045, r * 2.5 + uTime * 0.01, uTime * 0.015));
  float spoke = smoothstep(0.62, 0.86, w);
  // jen ve střední části prstence (B-ring), kde se reálně vyskytují
  float band = smoothstep(0.15, 0.3, r) * smoothstep(0.85, 0.6, r);
  float a = spoke * band * 0.32;
  gl_FragColor = vec4(vec3(0.05, 0.06, 0.1), a);
}
`

const SPOKES_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vLocal;
void main() {
  vUv = uv;
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** Ghostly rotating ring spokes (Saturn's B-ring, Voyager's famous find). */
export function makeSpokesMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: SPOKES_VERT,
    fragmentShader: SPOKES_FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  })
}

const SODIUM_TAIL_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUvTail;
` + NOISE_GLSL + /* glsl */ `
void main() {
  // vUvTail.y: 0 = u planety, 1 = konec ohonu; jemné vlání šumem
  float along = vUvTail.y;
  float across = abs(vUvTail.x - 0.5) * 2.0;
  float waver = fbm(vec3(along * 3.0 - uTime * 0.08, vUvTail.x * 4.0, uTime * 0.03));
  float a = (1.0 - along) * (1.0 - smoothstep(0.35, 1.0, across)) * (0.5 + 0.5 * waver) * 0.35;
  gl_FragColor = vec4(1.0, 0.9, 0.45, 1.0) * a; // sodíková žluť
}
`

const SODIUM_TAIL_VERT = /* glsl */ `
varying vec2 vUvTail;
void main() {
  vUvTail = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** Mercury's comet-like sodium tail — always points away from the Sun
 * (real, photographed phenomenon; solar radiation pressure blows sodium
 * atoms off the surface). Additive, faint, wavering. */
export function makeSodiumTailMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: SODIUM_TAIL_VERT,
    fragmentShader: SODIUM_TAIL_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
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

  // pár kráterů na seedovaných směrech: jeden dominantní (Stickney!) + dva menší;
  // hloubky mírné, ať těleso vypadá jako NASA fotka, ne jako rozkousané
  const craters: { dir: THREE.Vector3; size: number; depth: number }[] = []
  for (let c = 0; c < 3; c++) {
    const u = potatoNoise(c + 1, seed, 0.7, seed) * 2 - 1
    const t = potatoNoise(0.3, c + 2, seed, seed) * Math.PI * 2
    const r = Math.sqrt(Math.max(0, 1 - u * u))
    craters.push({
      dir: new THREE.Vector3(r * Math.cos(t), u, r * Math.sin(t)).normalize(),
      size: c === 0 ? 0.55 : 0.3 + 0.15 * potatoNoise(c, 0.5, seed, seed),
      depth: c === 0 ? 0.09 : 0.05 + 0.03 * potatoNoise(seed, c, 1.1, seed),
    })
  }

  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize()
    // elipsoid (brambora, ne koule) + jemné hrudy — mírně, ať tvar čte hladce
    let f = 1
    f *= 1 + 0.09 * (potatoNoise(v.x * 2.1, v.y * 2.1, v.z * 2.1, seed) - 0.5) * 2
    f *= 1 + 0.035 * (potatoNoise(v.x * 5.3, v.y * 5.3, v.z * 5.3, seed + 9) - 0.5) * 2
    for (const c of craters) {
      const ang = v.angleTo(c.dir)
      if (ang < c.size) f -= c.depth * (Math.cos((ang / c.size) * Math.PI) * 0.5 + 0.5)
    }
    const rr = radius * f
    pos.setXYZ(i, v.x * rr * 1.22, v.y * rr * 0.94, v.z * rr * 0.84)
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
  // New Horizons: modré vrstvy dusíkové mlhy na limbu Pluta
  pluto: { color: '#8ab8f0', power: 3.8, intensity: 0.5 },
}
