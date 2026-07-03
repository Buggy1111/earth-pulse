/** Procedural animated Sun: photosphere granulation (3-octave value noise),
 * a warm color ramp and limb darkening — no texture needed, alive at any
 * zoom. Drive `uniforms.uTime` from the frame loop (real seconds; the
 * granulation is a surface phenomenon, it should not speed up with warp). */

import * as THREE from 'three'

const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vViewNormal;
void main() {
  vObj = normalize(position);
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** 3D value-noise + 3-octave fbm — shared by the Sun family of shaders
 * (photosphere, corona, prominences). */
export const NOISE_GLSL = /* glsl */ `
float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}
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
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * vnoise(p);
    p *= 2.1;
    a *= 0.5;
  }
  return v;
}
`

const FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vObj;
varying vec3 vViewNormal;
` + NOISE_GLSL + /* glsl */ `

void main() {
  // slow large convection cells + fine drifting granulation — vyšší kontrast,
  // ať povrch VIDITELNĚ vře (tmavé mezigranulární pruhy vs. žhavé vrcholy)
  float cells = fbm(vObj * 4.0 + vec3(0.0, uTime * 0.025, 0.0));
  float grains = fbm(vObj * 16.0 - vec3(uTime * 0.045, 0.0, uTime * 0.025));
  float b = 0.52 + 0.55 * cells + 0.3 * grains;

  // warm ramp: deep orange valleys -> pale yellow granule tops
  vec3 col = mix(vec3(0.92, 0.36, 0.07), vec3(1.0, 0.94, 0.68), clamp(b - 0.3, 0.0, 1.0));

  // bílo-žhavé jádro nejžhavějších buněk — to "roztavené" navrch
  float hot = pow(clamp((cells - 0.52) * 2.6, 0.0, 1.0), 2.0);
  col += vec3(1.0, 0.92, 0.75) * hot * 0.7;

  // limb darkening + a hot thin rim right at the edge
  float mu = clamp(vViewNormal.z, 0.0, 1.0);
  col *= 0.5 + 0.5 * pow(mu, 0.55);
  col += vec3(1.0, 0.55, 0.2) * pow(1.0 - mu, 6.0) * 0.8;

  gl_FragColor = vec4(col * 1.08, 1.0);
}
`

export function makeSunMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: FRAG,
  })
}
