/** Trail-through-body fix. Display sizes are stylized (planets are drawn ~10³×
 * bigger than reality), so probe tails and moon-orbit rings geometrically cross
 * the oversized discs and read as "the tail goes through the planet". Depth
 * testing can't help with the in-front crossings — instead every trail line
 * discards fragments that fall INSIDE any displayed body sphere.
 *
 * One shared uniform (vec4: xyz = world centre, w = radius², 0 = unused slot);
 * the solar frame loop refreshes it once per frame, every patched material
 * reads it. Patching uses onBeforeCompile so LineBasicMaterial keeps its
 * vertex-colour/fog handling untouched. */

import * as THREE from 'three'

export const MAX_OCCLUDERS = 12

export const occluderUniform: { value: THREE.Vector4[] } = {
  value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4(0, 0, 0, 0)),
}

export function setOccluder(i: number, x: number, y: number, z: number, radius: number): void {
  if (i < 0 || i >= MAX_OCCLUDERS) return
  occluderUniform.value[i].set(x, y, z, radius * radius)
}

/** Patch a line material so its fragments vanish inside displayed bodies. */
export function occludeLineMaterial<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBodies = occluderUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldTrail;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvWorldTrail = (modelMatrix * vec4(position, 1.0)).xyz;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'uniform float opacity;',
        `uniform float opacity;\nuniform vec4 uBodies[${MAX_OCCLUDERS}];\nvarying vec3 vWorldTrail;`,
      )
      .replace(
        'void main() {',
        `void main() {
\tfor (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
\t\tif (uBodies[i].w <= 0.0) continue;
\t\tvec3 dToBody = vWorldTrail - uBodies[i].xyz;
\t\tif (dot(dToBody, dToBody) < uBodies[i].w) discard;
\t}`,
      )
  }
  mat.needsUpdate = true
  return mat
}
