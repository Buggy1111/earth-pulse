/** Globe material that blends NASA day and night-lights textures along the
 * real terminator — city lights fade in exactly where the Sun has set.
 * The Sun direction uniform is fed from `subsolarPoint()` once a minute.
 */

import * as THREE from 'three'

const VERTEX = /* glsl */ `
varying vec3 vWorldNormal;
varying vec2 vUv;
void main() {
  vUv = uv;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D dayTexture;
uniform sampler2D nightTexture;
uniform vec3 sunDirection;
varying vec3 vWorldNormal;
varying vec2 vUv;
void main() {
  vec3 day = texture2D(dayTexture, vUv).rgb;
  vec3 night = texture2D(nightTexture, vUv).rgb;
  float cosAngle = dot(normalize(vWorldNormal), normalize(sunDirection));
  // soft ~14 degree twilight band around the terminator
  float blend = smoothstep(-0.12, 0.12, cosAngle);
  vec3 dayLit = day * (0.7 + 0.4 * max(cosAngle, 0.0));
  vec3 nightLit = night * 1.45 + vec3(0.012, 0.018, 0.035);
  gl_FragColor = vec4(mix(nightLit, dayLit, blend), 1.0);
}
`

export function makeDayNightMaterial(
  day: THREE.Texture,
  night: THREE.Texture,
  sunDirection: { value: THREE.Vector3 },
): THREE.ShaderMaterial {
  day.colorSpace = THREE.SRGBColorSpace
  night.colorSpace = THREE.SRGBColorSpace
  return new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: day },
      nightTexture: { value: night },
      sunDirection,
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  })
}

/** Make the cloud layer honor the same Sun: clouds fade to near-invisible on
 * the night side instead of being flatly lit by the scene lights (which would
 * wash out the city lights). Shares the globe material's sunDirection uniform. */
export function sunlitClouds(
  material: THREE.MeshPhongMaterial,
  sunDirection: { value: THREE.Vector3 },
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.sunDirection = sunDirection
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSunNormal;')
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvSunNormal = normalize(mat3(modelMatrix) * normal);',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 sunDirection;\nvarying vec3 vSunNormal;',
      )
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\n' +
          'float sunBlend = smoothstep(-0.12, 0.12, dot(normalize(vSunNormal), normalize(sunDirection)));\n' +
          'gl_FragColor.a *= 0.12 + 0.88 * sunBlend;',
      )
  }
  material.needsUpdate = true
}
