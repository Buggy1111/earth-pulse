/** Living solar corona + prominence fringe — fully procedural, no textures.
 *
 * Corona: a screen-aligned billboard (spherical billboarding done in the
 * vertex shader, so no per-frame JS and no camera plumbing) with radial
 * falloff, slowly rotating fbm streamers and a two-frequency breathing pulse.
 *
 * Prominences: a thin additive shell over the photosphere whose fragment
 * shader lights up only near the limb (low view-normal z) with animated
 * noise "flames" — reads as the boiling chromosphere edge.
 *
 * Drive `uniforms.uTime` in real seconds from the frame loop (surface/corona
 * dynamics must not speed up with time warp, same rule as the photosphere).
 */

import * as THREE from 'three'
import { NOISE_GLSL } from './sunMaterial'

/** Vertex shader: classic sprite billboard — the plane is re-anchored to the
 * mesh origin in view space, so it always faces the camera regardless of
 * parent rotations. Plane geometry size = world size. */
const BILLBOARD_VERT = /* glsl */ `
uniform float uScale;
varying vec2 vUv;
void main() {
  vUv = position.xy * uScale;
  vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mvPosition.xy += position.xy * uScale;
  gl_Position = projectionMatrix * mvPosition;
}
`

const CORONA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uRadius; // fotosféra ve world jednotkách (uv je ve world scale)
uniform vec3 uTint;
varying vec2 vUv;
` + NOISE_GLSL + /* glsl */ `
void main() {
  float r = length(vUv) / uRadius;   // 1.0 = okraj fotosféry
  if (r < 0.98 || r > 8.0) discard;  // pod diskem nic, daleko nic

  float ang = atan(vUv.y, vUv.x);

  // paprsky: fbm přes úhel, pomalu rotují a "dýchají" podél poloměru;
  // druhá jemnější sada v protisměru rozbíjí pravidelnost
  float rays = fbm(vec3(cos(ang), sin(ang), 0.35) * 3.0
                   + vec3(0.0, 0.0, uTime * 0.03) + vec3(uTime * 0.012))
             + 0.5 * fbm(vec3(cos(ang), sin(ang), -0.6) * 7.0
                   - vec3(0.0, 0.0, uTime * 0.05));
  rays = clamp(rays * 0.85, 0.0, 1.3);

  // dvojfrekvenční pulz — koróna pomalu "dýchá" (pár % jasu)
  float pulse = 1.0 + 0.05 * sin(uTime * 0.35) + 0.03 * sin(uTime * 0.13 + 1.7);

  // radiální profil: hustá vnitřní koróna + dlouhé řídké paprsky — ŽHAVĚJI:
  // silnější věnec u disku a paprsky sahající znatelně dál
  float inner = exp(-(r - 1.0) * 2.6);
  float outer = exp(-(r - 1.0) * 0.65) * (0.25 + 0.75 * rays);
  float glow = (inner * 1.15 + outer * 0.75) * pulse;

  // barvy: bílo-žlutý věnec u disku -> oranžová -> zčervenalé konce paprsků
  vec3 col = mix(vec3(1.0, 0.62, 0.25), vec3(1.0, 0.94, 0.78),
                 clamp(inner * 1.3, 0.0, 1.0));
  col = mix(vec3(0.95, 0.35, 0.14), col, clamp(glow * 1.4, 0.0, 1.0));
  col *= uTint; // spektrální tón (Slunce bílé, Betelgeuse rudá, Rigel modrý)

  gl_FragColor = vec4(col * glow, clamp(glow, 0.0, 1.0));
}
`

const PROMINENCE_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vObj;
varying vec3 vViewNormal;
` + NOISE_GLSL + /* glsl */ `
void main() {
  // svítí jen okraj disku (limb) — uprostřed je fotosféra, tam nic
  float mu = clamp(abs(vViewNormal.z), 0.0, 1.0);
  float limb = pow(1.0 - mu, 5.0);

  // dvě vrstvy "plamenů": pomalé velké jazyky + rychlé drobné šlehy
  float tongues = fbm(vObj * 6.0 + vec3(0.0, uTime * 0.10, 0.0));
  float licks = fbm(vObj * 14.0 - vec3(uTime * 0.22, 0.0, uTime * 0.13));
  float flame = clamp(tongues * 0.9 + licks * 0.5 - 0.25, 0.0, 1.0);

  float a = limb * flame * 2.0;
  vec3 col = mix(vec3(1.0, 0.25, 0.08), vec3(1.0, 0.78, 0.38), flame);
  gl_FragColor = vec4(col * a, a);
}
`

const PROMINENCE_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vViewNormal;
void main() {
  vObj = normalize(position);
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export function makeCoronaMaterial(sunRadius: number, tint = '#ffffff'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: sunRadius },
      uScale: { value: 1 },
      uTint: { value: new THREE.Color(tint) },
    },
    vertexShader: BILLBOARD_VERT,
    fragmentShader: CORONA_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}

export function makeProminenceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: PROMINENCE_VERT,
    fragmentShader: PROMINENCE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
}
