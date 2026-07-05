/** Trail-through-body fix. Display sizes are stylized (planets are drawn ~10³×
 * bigger than reality), so probe tails and moon-orbit rings geometrically cross
 * the oversized discs and read as "the tail goes through the planet". Depth
 * testing can't help: the offending stretch of orbit is often NEARER than the
 * body, sliding across its disc in screen space. So every trail line discards
 * fragments that PROJECT inside any displayed body's disc — the line visually
 * ends at the limb on both sides, exactly like a real occultation.
 *
 * One shared uniform (vec4: xyz = world centre, w = display radius, 0 = unused
 * slot); the solar frame loop refreshes it once per frame, every patched
 * material reads it. Patching uses onBeforeCompile so LineBasicMaterial keeps
 * its vertex-colour/fog handling untouched. */

import * as THREE from 'three'

// 0 = Sun, 1 = Earth, 2–10 = planets, 11 = Earth's Moon, 12+ = planet moons
export const MAX_OCCLUDERS = 40

export const occluderUniform: { value: THREE.Vector4[] } = {
  value: Array.from({ length: MAX_OCCLUDERS }, () => new THREE.Vector4(0, 0, 0, 0)),
}

export function setOccluder(i: number, x: number, y: number, z: number, radius: number): void {
  if (i < 0 || i >= MAX_OCCLUDERS) return
  occluderUniform.value[i].set(x, y, z, radius)
}

/** Patch a line material so its fragments vanish across displayed bodies.
 * Screen-space disc test: with v = fragment − camera and b = body − camera,
 * the fragment sits inside the body's apparent disc when the angle between
 * v and b is under the body's angular radius — |v×b| < r·|v| (the |b|'s
 * cancel), same-side gated by dot(v,b) > 0 so bodies behind the camera
 * can't eat the view in front. Also covers points inside the sphere. */
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
\tvec3 vTrail = vWorldTrail - cameraPosition;
\tfloat vLen = length(vTrail);
\tfor (int i = 0; i < ${MAX_OCCLUDERS}; i++) {
\t\tif (uBodies[i].w <= 0.0) continue;
\t\tvec3 bDir = uBodies[i].xyz - cameraPosition;
\t\tif (dot(vTrail, bDir) <= 0.0) continue;
\t\tif (length(cross(vTrail, bDir)) < uBodies[i].w * vLen) discard;
\t}`,
      )
  }
  mat.needsUpdate = true
  return mat
}
