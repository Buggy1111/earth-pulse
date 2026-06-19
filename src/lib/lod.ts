/** Level-of-detail picking for the Starlink swarm. The real GLB model is far
 * too heavy to draw 10k times (≈140M triangles/frame), so only the satellites
 * nearest the camera get the model — the rest stay cheap flat panels. This is
 * the pure "which ones are nearest" decision; the rendering lives in the layer. */

/** Indices of the `n` smallest distances, nearest first. Non-finite distances
 * (hidden / decayed sats) sort last and are only picked if nothing closer is
 * left, so a caller can drop them by checking finiteness. */
export function selectNearest(distSq: ArrayLike<number>, n: number): number[] {
  const pairs: [number, number][] = []
  for (let i = 0; i < distSq.length; i++) pairs.push([distSq[i], i])
  pairs.sort((a, b) => a[0] - b[0])
  const out: number[] = []
  const limit = Math.min(n, pairs.length)
  for (let i = 0; i < limit; i++) out.push(pairs[i][1])
  return out
}
