/**
 * The shadow a standing picture casts on the ground. Each column of the picture starts from its own
 * lowest solid pixel and lays its height along the sun, so the shadow leaves along the thing's real
 * bottom edge. (Squashing the whole picture about one foot point gave wide furniture a straight
 * strip sticking out either side of it.) The edge is the outline's lower hull, not each column's own
 * end: the ring of an armillary overhangs its stand, and still stands that far off the ground.
 */
export interface CastMask { w: number; h: number; alpha: Uint8Array }

/** `rgba` is the picture, w by h. Sun is shadow length per px of height; both parts must be at least 0. Top-left stays at 0, 0. */
export function castMask(rgba: ArrayLike<number>, w: number, h: number, sx: number, sy: number): CastMask {
  const W = w + Math.ceil(sx * h) + 1, H = h + Math.ceil(sy * h) + 1, alpha = new Uint8Array(W * H);
  const base = lowerHull(rgba, w, h);
  // A shadow is stretched, and each column's base is at its own height, so one source pixel has to cover
  // several shadow pixels. Sampling finer than a pixel in both directions leaves no holes; the source
  // pixel's own alpha still decides, so real gaps in a picture stay gaps.
  const perUp = Math.ceil(2 * Math.max(1, sx, sy));
  for (let x = 0; x < w; x++) {
    if (base[x] < 0) continue;
    const prev = x > 0 && base[x - 1] >= 0 ? base[x - 1] : base[x], next = x + 1 < w && base[x + 1] >= 0 ? base[x + 1] : base[x];
    const perX = Math.ceil(2 * Math.max(1, Math.abs(next - base[x]), Math.abs(prev - base[x])));
    for (let sub = 0; sub < perX; sub++) {
      // this column's width, half a pixel either side, with its base running half way to each neighbour's
      const k = (sub + 0.5) / perX - 0.5, b = base[x] + ((k < 0 ? prev : next) - base[x]) * Math.abs(k);
      for (let n = 0; ; n++) {
        const up = n / perUp, y = base[x] - Math.floor(up);
        if (y < 0) break;
        if (y >= h || rgba[(y * w + x) * 4 + 3] < 128) continue;
        const dy = Math.round(b + sy * up), dx = Math.round(x + k + sx * up);
        if (dy < H && dx < W) alpha[dy * W + dx] = 255;
      }
    }
  }
  return { w: W, h: H, alpha };
}

/** For each column, how far down the screen the picture's outline reaches once its undercuts are bridged. -1 where there's nothing at all. */
function lowerHull(rgba: ArrayLike<number>, w: number, h: number): Int32Array {
  const low = new Int32Array(w).fill(-1), hull: number[] = [];
  for (let x = 0; x < w; x++) {
    for (let y = h - 1; y >= 0 && low[x] < 0; y--) if (rgba[(y * w + x) * 4 + 3] >= 128) low[x] = y;
    if (low[x] < 0) continue;
    while (hull.length > 1) {
      const a = hull[hull.length - 2], b = hull[hull.length - 1];
      if ((b - a) * (low[x] - low[a]) - (low[b] - low[a]) * (x - a) < 0) break; // keeps only turns that bulge down the screen
      hull.pop();
    }
    hull.push(x);
  }
  const out = low.slice();
  for (let i = 1; i < hull.length; i++) {
    const a = hull[i - 1], b = hull[i];
    for (let x = a; x <= b; x++) if (low[x] >= 0) out[x] = Math.max(low[x], Math.round(low[a] + ((low[b] - low[a]) * (x - a)) / (b - a)));
  }
  return out;
}
