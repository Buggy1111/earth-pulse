/** Level-of-detail picking for the Starlink swarm. The real GLB model is far
 * too heavy to draw 10k times (≈140M triangles/frame), so only the satellites
 * nearest the camera get the model — the rest stay cheap flat panels. This is
 * the pure "which ones are nearest" decision; the rendering lives in the layer. */

/** Indices of the `n` smallest distances, nearest first. Non-finite distances
 * (hidden / decayed sats) sort last and are only picked if nothing closer is
 * left, so a caller can drop them by checking finiteness. */
export function selectNearest(distSq: ArrayLike<number>, n: number): number[] {
  const len = distSq.length
  // sort a flat array of INDICES, not a [dist, i] tuple per satellite — for a
  // ~10k swarm at 2 Hz that was thousands of throwaway pair-arrays every tick.
  const idx: number[] = new Array(len)
  for (let i = 0; i < len; i++) idx[i] = i
  // ascending by distance; ties keep their original order so the pick is stable
  // (non-finite distances fall to the end, exactly like the old comparator).
  idx.sort((a, b) => distSq[a] - distSq[b] || a - b)
  idx.length = Math.min(n, len)
  return idx
}
