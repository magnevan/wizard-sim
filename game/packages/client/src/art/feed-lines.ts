/**
 * The battery's feed lines: glyph paths (art/glyph-path.ts) from the well to what it feeds, so you can see where the
 * defences' fire comes from (the user, 2026-11-12).
 *
 * Like traces on a circuit board, they leave the well's north side together, one lane each, and fan out: the
 * outermost lane turns off first, so none crosses another. Each runs west or east to its defence's pedestal (the
 * control), meets it on a diagonal, and turns north into the tower. The middle lane runs north to the gate and forks to
 * its two pillars, for the wall of fire.
 *
 * Their runes glow softly, a shimmer drifts behind them and shows only through them (glyph-path.ts Shimmer), and a slow
 * swell of light runs out along them from the well; how bright they are and how
 * fast it runs follow the well's flow (sim battery.flow), and the line to a defence someone is driving burns brighter.
 * As the well fails (beat 5) runes start to gutter; when it runs dry (beat 6) the light drains back down every line into
 * the well (art/power-down.ts), and they stay dark.
 */
import type { World } from '@wizard-sim/sim';
import { toX, toY } from '../iso-world';
import { PATH_STYLES, PathLayer, Shimmer, drawGlyphPath, pathLength, snap, type GlyphPath, type PathStyle, type RuneLook } from './glyph-path';
import { POWER, dryTime } from './power-down';
import { clamp, rand } from './util';

type LightFn = (x: number, y: number, r: number, col: string, a: number) => void;
interface Feed { path: GlyphPath; tower: number; from: number; len: number }

/** Fire's tones, hottest to darkest: only these, so the tileset is tinted a few times, once each. */
const TONE = { hot: '#ffe0a0', lit: '#ffb040', warm: '#e0701c', dim: '#8a3c14', cold: '#3a2418' } as const;
/** The lanes leaving the well: how far apart, how far out round the well they start, and the fan's shape. World units. */
const LANE = 1.5, RIM = 3.3, BEND = 1.6, RUN_OFF = 1.4, TOWER_R = 2.3;
/** The swell of light running out along the lines: its speed at a full well (units/s) and its spacing. */
const SWELL_SPEED = 2.2, SWELL_GAP = 7;

let cache: { def: unknown; feeds: Feed[] } | null = null;
const shimmer = new Shimmer(TONE.hot), layer = new PathLayer();

/** The routes, in the sim's world, worked out once per room from where the well, towers, pedestals and pillars stand. */
function feedsOf(w: World): Feed[] {
  if (cache && cache.def === w.def) return cache.feeds;
  // the view's props are turned (iso-world.ts): back to the sim's world
  const at = (asset: string) => w.def.props.filter((p) => p.asset === asset).map((p) => ({ x: toX(p.x, p.y), y: toY(p.x, p.y) }));
  const well = at('battery-well')[0], towers = at('defence-tower'), pads = at('control-pedestal'), pillars = at('battery-pillar');
  const feeds: Feed[] = [];
  if (well) {
    const rimY = (x: number) => well.y - Math.sqrt(Math.max(0, RIM * RIM - (x - well.x) ** 2));
    for (const s of [-1, 1]) {
      // this side's defences, nearest first: lane 1 is the nearest's, and the outer lanes turn off first
      const side = towers.map((t, k) => ({ t, k })).filter(({ t }) => Math.sign(t.x - well.x) === s).sort((a, b) => Math.abs(a.t.x - well.x) - Math.abs(b.t.x - well.x));
      side.forEach(({ t, k }, r) => {
        const pad = pads[k] ?? t, lx = well.x + s * LANE * (r + 1), yh = pad.y + RUN_OFF + LANE * r;
        const pts = snap([[lx, rimY(lx)], [lx, yh + BEND], [lx + s * BEND, yh], [pad.x - s * (yh - pad.y), yh], [pad.x, pad.y], [pad.x, t.y + TOWER_R]]);
        const path: GlyphPath = { pts, start: 'pad', end: 'pad', seed: 11 + k * 7 };
        feeds.push({ path, tower: k, from: 0, len: pathLength(path) });
      });
    }
    if (pillars.length === 2) {
      const forkY = Math.max(...pillars.map((p) => p.y)) + 3.6;
      const trunk: GlyphPath = { pts: [[well.x, rimY(well.x)], [well.x, forkY]], start: 'pad', end: 'node', seed: 5 };
      const tl = pathLength(trunk);
      feeds.push({ path: trunk, tower: -1, from: 0, len: tl });
      for (const p of pillars) {
        const s = Math.sign(p.x - well.x), end = p.x - s * 1.1;
        const branch: GlyphPath = { pts: snap([[well.x, forkY], [well.x + s * BEND, forkY - BEND], [end, forkY - BEND]]), start: 'none', end: 'pad', seed: 23 + (s > 0 ? 1 : 0) };
        feeds.push({ path: branch, tower: -1, from: tl, len: pathLength(branch) });
      }
    }
  }
  cache = { def: w.def, feeds };
  return feeds;
}

/** Draws every feed line on the ground canvas `g`. `t`: seconds of the view's clock. */
export function feedLines(g: Parameters<typeof drawGlyphPath>[0], w: World, t: number, light: LightFn): void {
  const d = w.battery;
  if (!d) return;
  const feeds = feedsOf(w), flow = d.flow[0], dt = dryTime(w), frame = Math.floor(t * 9);
  // how far out from the well the light still reaches, as a share of the longest line: all of it, or draining back
  const longest = Math.max(1, ...feeds.map((f) => f.from + f.len));
  const reach = dt > 0 ? longest * Math.max(0, 1 - dt / POWER.drain) : Infinity;
  const style = pathStyle(), ground = g;
  const mask = shimmer.begin(ground); // the runes' shimmer: stamped in as they're drawn, shown through them at the end
  g = layer.begin(ground); // the paths on a layer of their own, then laid into the ground in the style
  for (let fi = 0; fi < feeds.length; fi++) {
    const f = feeds[fi], driven = f.tower >= 0 && d.drive.includes(f.tower);
    const k = (driven ? 1 : 0.7) * (0.3 + 0.7 * flow); // how bright this line burns
    const rune = (s: number, n: number): RuneLook => {
      if (s > reach) return null;
      if (rand(n, frame + fi * 7, 913) < 0.55 * (1 - flow) * (1 - flow)) return null; // a failing well: runes gutter
      const swell = Math.max(0, Math.cos(((s - t * SWELL_SPEED * (0.3 + 0.7 * flow) * (driven ? 1.5 : 1)) / SWELL_GAP) * Math.PI * 2)) ** 6;
      const b = clamp(k * (0.75 + 0.1 * Math.sin(t * 1.7 + n * 1.3)) + 0.35 * swell * k, 0, 1.2);
      const col = b > 0.95 ? TONE.hot : b > 0.62 ? TONE.lit : b > 0.36 ? TONE.warm : TONE.dim;
      return { col, glow: b };
    };
    const lit = f.from < reach;
    drawGlyphPath(g, f.path, lit ? (k > 0.55 ? TONE.warm : TONE.dim) : TONE.cold, TONE.cold, rune, { from: f.from, light, mask: { g: mask, line: lit ? 0.35 * k : 0 }, lineAlpha: style.line / style.rune });
  }
  layer.end(ground, style);
  shimmer.end(ground, t, 0.85 * (0.25 + 0.75 * flow) * style.rune, (m) => layer.wearOut(m, ground, style));
}

/** The paths' style: PATH_STYLES by ?paths= in the URL, or window.__pathStyle (screenshots set it live). Clean by default. */
const URL_STYLE = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('paths');
function pathStyle(): PathStyle {
  const id = (globalThis as { __pathStyle?: string }).__pathStyle ?? URL_STYLE ?? 'a';
  return PATH_STYLES[id] ?? PATH_STYLES.a;
}
