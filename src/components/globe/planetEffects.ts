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
