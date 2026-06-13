/** The Moon's surface material: the lunar texture shaded by the real Sun
 * direction so the terminator (and thus the phase you actually see from Earth)
 * is physically correct. The dark side keeps a faint, cool earthshine glow and
 * the disc is limb-darkened for a rounded, photographed look. Shares the
 * scene's sunDirection uniform, so it tracks the simulated clock for free. */

import * as THREE from 'three'

const VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec2 vUv;
void main() {
  vUv = uv;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D moonTexture;
uniform vec3 sunDirection;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(moonTexture, vUv).rgb;
  float cosAngle = dot(normalize(vWorldNormal), normalize(sunDirection));
  // soft terminator, a touch wider than a hard line so craters read at the edge
  float lit = smoothstep(-0.08, 0.22, cosAngle);
  vec3 litSide = base * (0.9 + 0.5 * max(cosAngle, 0.0));
  vec3 darkSide = base * vec3(0.05, 0.06, 0.09); // faint earthshine, not pure black
  vec3 color = mix(darkSide, litSide, lit);
  // limb darkening — the disc fades slightly toward its silhouette
  float limb = smoothstep(0.0, 0.6, vViewNormal.z);
  color *= 0.72 + 0.28 * limb;
  gl_FragColor = vec4(color, 1.0);
}
`

export function makeMoonMaterial(
  texture: THREE.Texture,
  sunDirection: { value: THREE.Vector3 },
): THREE.ShaderMaterial {
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.ShaderMaterial({
    uniforms: {
      moonTexture: { value: texture },
      sunDirection,
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  })
}
