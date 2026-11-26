/**
 * A spray's raindrop for drawing (the sim's test is geom.ts inDrop, its size config.ts sprayShape): the outline from the
 * hands, along the edges tangent to the round bulb and round its far end, as points (sim x, y). `face` in radians.
 */
import { sprayShape } from '@wizard-sim/sim';

/** The drop's edge half-angle (radians) and reach at n runes. */
export function sprayDrop(n: number): { range: number; rb: number; half: number } {
  const d = sprayShape(n);
  return { range: d.range, rb: d.rb, half: Math.atan(d.tanHalf) };
}

export function dropOutline(x: number, y: number, face: number, n: number, steps = 32): [number, number][] {
  const { range, rb, half } = sprayDrop(n), c = range - rb, t = Math.sqrt(Math.max(0, c * c - rb * rb));
  const cx = x + Math.cos(face) * c, cy = y + Math.sin(face) * c, pts: [number, number][] = [[x, y]];
  // from the tangent point on one side round the far end to the other (the bulb's arc beyond the tangent points)
  const a0 = face - (Math.PI / 2 + half), a1 = face + (Math.PI / 2 + half);
  pts.push([x + Math.cos(face - half) * t, y + Math.sin(face - half) * t]);
  for (let k = 0; k <= steps; k++) { const a = a0 + ((a1 - a0) * k) / steps; pts.push([cx + Math.cos(a) * rb, cy + Math.sin(a) * rb]); }
  pts.push([x + Math.cos(face + half) * t, y + Math.sin(face + half) * t], [x, y]);
  return pts;
}
