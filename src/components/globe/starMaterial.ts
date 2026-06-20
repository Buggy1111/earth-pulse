/** Procedural animated star surface — the Sun shader generalised to any star:
 * photosphere granulation (3-octave value noise) with a temperature-driven
 * colour ramp, limb darkening and a hot rim. Colours, granule scale and a
 * gentle pulse come from lib/starLook so an O star looks nothing like an M
 * supergiant. Drive `uniforms.uTime` (real seconds) from the frame loop. */

import * as THREE from 'three'
import type { StarLook } from '../../lib/starLook'

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vViewNormal;
void main() {
  vObj = normalize(position);
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uValley;
uniform vec3 uPeak;
uniform vec3 uRim;
uniform float uCell;
uniform float uGran;
varying vec3 vObj;
varying vec3 vViewNormal;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), u.x),
        mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), u.x), u.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), u.x),
        mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), u.x), u.y),
    u.z);
}
float fbm(vec3 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.1; a *= 0.5; }
  return v;
}

void main() {
  // deeper granule contrast so the surface boils instead of reading as a flat
  // ball: bigger swing between cell valleys and granule tops
  float cells = fbm(vObj * uCell + vec3(0.0, uTime * 0.02, 0.0));
  float grains = fbm(vObj * uGran - vec3(uTime * 0.035, 0.0, uTime * 0.02));
  float b = 0.5 + 0.6 * cells + 0.3 * grains;

  vec3 col = mix(uValley, uPeak, clamp(b - 0.3, 0.0, 1.0));
  // lift saturation so the spectral colour (blue O/B, red M) really shows
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, 1.25);

  float mu = clamp(vViewNormal.z, 0.0, 1.0);
  col *= 0.55 + 0.45 * pow(mu, 0.5);         // limb darkening
  col += uRim * pow(1.0 - mu, 5.0) * 0.8;    // hot glowing rim at the edge

  gl_FragColor = vec4(col, 1.0);
}
`

export function makeStarMaterial(look: StarLook): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uValley: { value: new THREE.Color().fromArray(look.valley) },
      uPeak: { value: new THREE.Color().fromArray(look.peak) },
      uRim: { value: new THREE.Color().fromArray(look.rim) },
      uCell: { value: look.cellScale },
      uGran: { value: look.granScale },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  })
}

/** Push a new star's look into an existing material (re-used across picks). */
export function applyStarLook(mat: THREE.ShaderMaterial, look: StarLook): void {
  mat.uniforms.uValley.value.fromArray(look.valley)
  mat.uniforms.uPeak.value.fromArray(look.peak)
  mat.uniforms.uRim.value.fromArray(look.rim)
  mat.uniforms.uCell.value = look.cellScale
  mat.uniforms.uGran.value = look.granScale
}
