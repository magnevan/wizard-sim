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
import { BSTEP, CHANNEL, EL, LIFE_CIRCLE, MAX_SEATS, WELL, infused, pedestalNear, type World } from '@wizard-sim/sim';
import { toU, toV, toX, toY } from '../iso-world';
import { gx, gy } from './field';
import { PATH_STYLES, PathLayer, Shimmer, drawGlyphCircle, drawGlyphPath, pathLength, snap, type Box, type GlyphPath, type PathStyle, type RuneLook } from './glyph-path';
import { opt } from '../dev-options';
import { POWER, dryTime, lineLight, overload } from './power-down';
import * as X from './px';
import { clamp, rand } from './util';

type LightFn = (x: number, y: number, r: number, col: string, a: number) => void;
/** A line, and for a defence's, the possession circle it ends in (sim world). */
interface Feed { path: GlyphPath; tower: number; from: number; len: number; circle?: { x: number; y: number } }
/** A possession circle's radius, world units (sim battery.ts reach is a little more). */
const CIRCLE_R = 1.6;

/** Fire's tones, hottest to darkest: only these, so the tileset is tinted a few times, once each. */
const TONE = { hot: '#ffe0a0', lit: '#ffb040', warm: '#e0701c', dim: '#8a3c14', cold: '#3a2418' } as const;
/** The lanes leaving the well: how far apart, how far out round the well they start, and the fan's shape. World units. */
const LANE = 1.5, RIM = 3.3, BEND = 1.6, RUN_OFF = 1.4;
/** The swell of light running out along the lines: its speed at a full well (units/s) and its spacing. */
const SWELL_SPEED = 2.2, SWELL_GAP = 7;

/** How far a path's lines, runes, glow and carving reach past its middle, field px (generous), and the tile size the layers' passes keep to. */
const BOX_PAD = 28, TILE = 32;
let cache: { def: unknown; feeds: Feed[]; boxes: Box[] } | null = null;
const shimmer = new Shimmer(TONE.hot), layer = new PathLayer();

/** The routes, in the sim's world, worked out once per room from where the well, towers, pedestals and pillars stand. */
function feedsOf(w: World): Feed[] {
  if (cache && cache.def === w.def) return cache.feeds;
  // the view's props are turned (iso-world.ts): back to the sim's world
  const at = (asset: string) => w.def.props.filter((p) => p.asset === asset).map((p) => ({ x: toX(p.x, p.y), y: toY(p.x, p.y) }));
  const well = at('battery-well')[0], towers = at('defence-tower'), pads = at('possession-circle'), pillars = at('battery-pillar');
  const feeds: Feed[] = [];
  if (well) {
    const rimY = (x: number) => well.y - Math.sqrt(Math.max(0, RIM * RIM - (x - well.x) ** 2));
    for (const s of [-1, 1]) {
      // this side's defences, nearest first: lane 1 is the nearest's, and the outer lanes turn off first
      const side = towers.map((t, k) => ({ t, k })).filter(({ t }) => Math.sign(t.x - well.x) === s).sort((a, b) => Math.abs(a.t.x - well.x) - Math.abs(b.t.x - well.x));
      side.forEach(({ t, k }, r) => {
        // out along its lane, across, and in on a diagonal to its possession circle's rim (the circle touches the tower)
        const pad = pads[k] ?? t, lx = well.x + s * LANE * (r + 1), yh = pad.y + RUN_OFF + LANE * r, d = (yh - pad.y) - CIRCLE_R * Math.SQRT1_2;
        const pts = snap([[lx, rimY(lx)], [lx, yh + BEND], [lx + s * BEND, yh], [pad.x - s * (yh - pad.y), yh], [pad.x - s * (yh - pad.y) + s * d, yh - d]]);
        const path: GlyphPath = { pts, start: 'pad', end: 'none', seed: 11 + k * 7 };
        feeds.push({ path, tower: k, from: 0, len: pathLength(path), circle: pad });
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
  cache = { def: w.def, feeds, boxes: tilesOf(feeds) };
  return feeds;
}

/**
 * The field's tiles (TILE px, field px) within BOX_PAD of a line or a circle, merged into runs along each row of tiles:
 * the layers' passes keep to them (glyph-path.ts Box), as the lines are thin and cross most of the view.
 */
function tilesOf(feeds: readonly Feed[]): Box[] {
  const on = new Map<number, Set<number>>(); // tile row -> tile columns
  const mark = (fx: number, fy: number): void => {
    for (let ty = Math.floor((fy - BOX_PAD) / TILE); ty <= Math.floor((fy + BOX_PAD) / TILE); ty++) {
      let row = on.get(ty);
      if (!row) { row = new Set(); on.set(ty, row); }
      for (let tx = Math.floor((fx - BOX_PAD) / TILE); tx <= Math.floor((fx + BOX_PAD) / TILE); tx++) row.add(tx);
    }
  };
  const F = (x: number, y: number): [number, number] => [gx(toU(x, y)), gy(toV(x, y))];
  for (const f of feeds) {
    const pts = f.path.pts;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = F(pts[i - 1][0], pts[i - 1][1]), [bx, by] = F(pts[i][0], pts[i][1]), n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
      for (let k = 0; k <= n; k++) mark(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
    }
    if (f.circle) {
      // the whole disc: its rings, runes and the pad in its middle
      for (let r = 0; r <= CIRCLE_R; r += 0.25) for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; mark(...F(f.circle.x + Math.cos(a) * r, f.circle.y + Math.sin(a) * r)); }
    }
  }
  const boxes: Box[] = [];
  for (const [ty, row] of on) {
    const cols = [...row].sort((a, b) => a - b);
    for (let i = 0; i < cols.length;) {
      let j = i;
      while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
      boxes.push({ x: cols[i] * TILE, y: ty * TILE, w: (cols[j] - cols[i] + 1) * TILE, h: TILE });
      i = j + 1;
    }
  }
  return boxes;
}

/** Draws every feed line on the ground canvas `g`. `t`: seconds of the view's clock. */
export function feedLines(g: Parameters<typeof drawGlyphPath>[0], w: World, t: number, light: LightFn): void {
  const d = w.battery;
  if (!d) return;
  const feeds = feedsOf(w), ll = lineLight(w), flow = ll.flow;
  // how far out from the well the light reaches, as a share of the longest line: all of it, draining back, or running
  // out again with the repair
  const longest = Math.max(1, ...feeds.map((f) => f.from + f.len));
  const reach = ll.reach >= 1 ? Infinity : longest * ll.reach;
  const style = pathStyle(), ground = g, at = g.getTransform(), o = overload(w);
  const boxes = cache!.boxes.map((b) => ({ x: b.x + at.e, y: b.y + at.f, w: b.w, h: b.h })); // field px to the canvas's own
  // the burst: every rune white-hot for a moment as the well gives out
  const dry = dryTime(w), flash = dry > 0 && dry < POWER.burst ? 1 - dry / POWER.burst : 0;
  // Overloaded, the runes never go dim (the user, 2026-11-14: the paths blinked on and off too erratically): each steps
  // between bright, very bright and a white spark, a few times a second, sparking more as it nears bursting. The lines
  // burn as bright as a full well's while it does.
  const power = Math.max(flow, o), spark = Math.floor(t * 6);
  const overRune = (n: number, fi: number): RuneLook => {
    if (o <= 0.05) return null;
    const r = rand(n, spark + fi * 3, 919);
    return r < 0.08 + 0.22 * o ? { col: '#ffffff', glow: 1.25 } : r < 0.6 ? { col: TONE.hot, glow: 1.1 } : { col: TONE.lit, glow: 0.95 };
  };
  const mask = shimmer.begin(ground, boxes); // the runes' shimmer: stamped in as they're drawn, shown through them at the end
  g = layer.begin(ground, boxes); // the paths on a layer of their own, then laid into the ground in the style
  for (let fi = 0; fi < feeds.length; fi++) {
    const f = feeds[fi], driven = f.tower >= 0 && d.drive.includes(f.tower);
    const k = (driven ? 1 : 0.7) * (0.3 + 0.7 * power); // how bright this line burns
    const rune = (s: number, n: number): RuneLook => {
      if (flash > 0.25) return { col: flash > 0.6 ? '#ffffff' : TONE.hot, glow: 1.2 };
      if (s > reach) return overRune(n, fi); // overloaded, every rune burns, past the swell's reach too
      const sparked = overRune(n, fi);
      if (sparked) return sparked;
      const swell = Math.max(0, Math.cos(((s - t * SWELL_SPEED * (0.3 + 0.7 * flow) * (driven ? 1.5 : 1)) / SWELL_GAP) * Math.PI * 2)) ** 6;
      const b = clamp(k * (0.75 + 0.1 * Math.sin(t * 1.7 + n * 1.3)) + 0.35 * swell * k, 0, 1.2);
      const col = b > 0.95 ? TONE.hot : b > 0.62 ? TONE.lit : b > 0.36 ? TONE.warm : TONE.dim;
      return { col, glow: b };
    };
    const lit = f.from < reach;
    drawGlyphPath(g, f.path, lit ? (k > 0.55 ? TONE.warm : TONE.dim) : TONE.cold, TONE.cold, rune, { from: f.from, light, mask: { g: mask, line: lit ? 0.35 * k : 0 }, lineAlpha: style.line / style.rune });
    if (f.circle) {
      // its possession circle: lit while the light reaches it; possessed, it burns and turns; someone in it, it brightens;
      // free while the lesson is on, it pulses to draw you over
      const on = f.from + f.len < reach, near = !driven && occupied(w, f.tower), lesson = w.enc.state[1] <= BSTEP.brute;
      const ck = !on ? 0 : driven ? 1 : near ? 0.95 : (0.6 + (lesson ? 0.35 * (0.5 + 0.5 * Math.sin(t * 3.2)) : 0)) * (0.3 + 0.7 * power);
      const cRune = (n: number): RuneLook => {
        if (!on) return null;
        const sparked = overRune(n + 500, fi);
        if (sparked) return sparked;
        const b = clamp(ck * (0.8 + 0.2 * Math.sin(t * 2.4 + n * 0.9)), 0, 1.2);
        return { col: b > 0.9 ? TONE.hot : b > 0.6 ? TONE.lit : b > 0.34 ? TONE.warm : TONE.dim, glow: b };
      };
      drawGlyphCircle(g, f.circle.x, f.circle.y, CIRCLE_R, 31 + f.tower * 3, on ? (ck > 0.55 ? TONE.lit : TONE.warm) : TONE.cold, TONE.cold, cRune,
        { spin: driven ? t * 0.6 : 0, mask: { g: mask, line: on ? 0.5 * ck : 0 }, lineAlpha: style.line / style.rune });
      if (on && ck > 0.5) { const [lx, ly] = [gx(toU(f.circle.x, f.circle.y)), gy(toV(f.circle.x, f.circle.y))]; light(lx, ly, 34, '#ff9a30', 0.3 * ck); }
    }
  }
  layer.end(ground, style);
  shimmer.end(ground, t, 0.85 * (0.25 + 0.75 * power) * style.rune, (m) => layer.wearOut(m, ground, style));
  pathSparks(ground, w, t, feeds, light);
  lifeCircleArt(ground, w, t, light);
}

/**
 * The overload, where you are (the user, 2026-11-14: from most defences the crystal is out of sight). Arcs crackle along
 * every path, more and more often as the well's flow falls (`overload`); when it bursts, every path flashes white and
 * throws a spray of sparks. In the ground canvas's px.
 */
interface PathSpark { x: number; y: number; vx: number; vy: number; life: number; max: number; arc: boolean; seed: number }
let sparks: PathSpark[] = [], sparkT = -1, burstSeen = false;
/** Crackles a second over all the paths at full overload (they're spread over the whole room); burst sparks a unit of path. */
const SPARK = { rate: 170, burst: 3, gravity: 60, arc: 14 } as const;

/** A point s units along a path's waypoints (the sim's world). */
function along(pts: readonly (readonly [number, number])[], s: number): [number, number] {
  for (let k = 1; k < pts.length; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], l = Math.hypot(x1 - x0, y1 - y0);
    if (s <= l || k === pts.length - 1) { const q = l > 0 ? Math.min(1, s / l) : 0; return [x0 + (x1 - x0) * q, y0 + (y1 - y0) * q]; }
    s -= l;
  }
  return [pts[0][0], pts[0][1]];
}

function pathSparks(g: Parameters<typeof drawGlyphPath>[0], w: World, t: number, feeds: readonly Feed[], light: LightFn): void {
  const dt = sparkT < 0 ? 0 : clamp(t - sparkT, 0, 0.1);
  sparkT = t;
  const o = overload(w), dry = dryTime(w);
  const at = (f: Feed, s: number): [number, number] => { const [x, y] = along(f.path.pts, s); return [gx(toU(x, y)), gy(toV(x, y))]; };
  const total = feeds.reduce((a, f) => a + f.len, 0);
  // crackles: short arcs that hop along the paths, a few at first, a storm at the end
  if (o > 0.05 && total > 0) {
    let want = dt * SPARK.rate * (0.2 * o + 0.8 * o * o);
    while (want > 0) {
      if (want < 1 && Math.random() > want) break;
      want--;
      let s = Math.random() * total, fi = 0;
      while (fi < feeds.length - 1 && s > feeds[fi].len) { s -= feeds[fi].len; fi++; }
      const [x, y] = at(feeds[fi], feeds[fi].from + s);
      const life = 0.08 + Math.random() * 0.12;
      sparks.push({ x, y, vx: 0, vy: 0, life, max: life, arc: true, seed: Math.random() * 1000 });
      if (Math.random() < 0.5) { const a = Math.random() * Math.PI * 2; sparks.push({ x, y, vx: Math.cos(a) * 18, vy: -14 - Math.random() * 18, life: 0.35, max: 0.35, arc: false, seed: 0 }); }
    }
  }
  // the burst: once, the moment it runs dry
  if (dry > 0 && dry < POWER.burst && !burstSeen) {
    burstSeen = true;
    for (const f of feeds) for (let s = 0; s < f.len; s += 1 / SPARK.burst) {
      const [x, y] = at(f, f.from + s), a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 50;
      const life = 0.4 + Math.random() * 0.5;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 30, life, max: life, arc: Math.random() < 0.25, seed: Math.random() * 1000 });
    }
  }
  if (dry <= 0) burstSeen = false;
  // and through the burst every path is a line of white fire, drawn over the worn-in paths at full strength
  if (dry > 0 && dry < POWER.burst) {
    const k = 1 - dry / POWER.burst;
    for (const f of feeds) {
      let [px, py] = at(f, f.from);
      for (let s = 0.5; s <= f.len; s += 0.5) {
        const [x, y] = at(f, f.from + s);
        X.line(g, Math.round(px), Math.round(py), Math.round(x), Math.round(y), k > 0.5 ? '#ffffff' : '#ffd070', k > 0.7 ? 2 : 1);
        if (Math.round(s * 2) % 6 === 0) light(x, y, 22, '#ffd890', 0.45 * k);
        px = x; py = y;
      }
    }
  }
  const keep: PathSpark[] = [];
  for (const p of sparks) {
    p.life -= dt;
    if (p.life <= 0) continue;
    keep.push(p);
    const k = p.life / p.max;
    if (p.arc) {
      // a jagged little arc across the path, white at its heart
      const n = 6, A = SPARK.arc, ang = rand(Math.floor(p.seed), 1, 31) * Math.PI;
      let x = p.x - Math.cos(ang) * A / 2, y = p.y - Math.sin(ang) * A / 4;
      for (let j = 1; j <= n; j++) {
        const nx = p.x - Math.cos(ang) * A / 2 + Math.cos(ang) * A * (j / n) + (rand(Math.floor(p.seed) + j, 2, 37) - 0.5) * 4;
        const ny = p.y - Math.sin(ang) * A / 4 + Math.sin(ang) * (A / 2) * (j / n) + (rand(Math.floor(p.seed) + j, 3, 41) - 0.5) * 4 - 2;
        X.line(g, Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), k > 0.5 ? '#ffffff' : '#ffb848');
        x = nx; y = ny;
      }
      light(p.x, p.y, 20, '#ffc060', 0.4 * k);
    } else {
      p.vy += SPARK.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      X.px(g, Math.round(p.x), Math.round(p.y), k > 0.6 ? '#fff0c0' : k > 0.3 ? '#ffa040' : '#c05020');
    }
  }
  sparks = keep.length > 600 ? keep.slice(-600) : keep;
}

/** The Life circle's glyphs: green, where the well's are orange. */
const LIFE = { hot: '#eaffd8', lit: '#8af08e', warm: '#3fae5a', dim: '#1e5a30', cold: '#1a2a1c' } as const;

/**
 * The battery's Life circle (sim battery.ts LIFE_CIRCLE, a channel circle): it lights up green from the infusion on,
 * breathing, and burns and turns while someone channels it. Drawn over the paths, on the ground.
 */
function lifeCircleArt(g: Parameters<typeof drawGlyphPath>[0], w: World, t: number, light: LightFn): void {
  if (!w.battery || !infused(w)) return;
  const well = w.def.props.find((p) => p.asset === 'battery-well');
  if (!well) return;
  // the view's props are turned (iso-world.ts): the well back in the sim's world, and the circle off it there
  const cx = toX(well.x, well.y) + LIFE_CIRCLE.dx, cy = toY(well.x, well.y) + LIFE_CIRCLE.dy;
  const lit = clamp((dryTime(w) - WELL.surge) / 0.6, 0, 1); // it lights as you're infused
  const used = w.battery.channel.some((e) => e === EL.life);
  const k = lit * (used ? 1 : 0.65 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.6)));
  const rune = (n: number): RuneLook => {
    const b = clamp(k * (0.8 + 0.2 * Math.sin(t * 2.2 + n * 1.1)), 0, 1.2);
    return b < 0.1 ? null : { col: b > 0.9 ? LIFE.hot : b > 0.6 ? LIFE.lit : b > 0.34 ? LIFE.warm : LIFE.dim, glow: b };
  };
  drawGlyphCircle(g, cx, cy, CHANNEL.radius, 97, k > 0.55 ? LIFE.lit : LIFE.warm, LIFE.cold, rune, { spin: used ? t * 0.8 : 0 });
  light(gx(toU(cx, cy)), gy(toV(cx, cy)), 38, '#6ae07a', 0.32 * k);
}

/** Is a wizard standing in defence k's circle (and could step up)? */
function occupied(w: World, k: number): boolean {
  for (let i = 0; i < MAX_SEATS; i++) if (w.seats.active[i] && pedestalNear(w, i) === k) return true;
  return false;
}

/**
 * The paths' style: PATH_STYLES by ?paths= in the URL, or window.__pathStyle (screenshots set it live). By default e,
 * see-through, worn and carved (the user's pick, 2026-11-12, from scripts/path-styles.mjs).
 */
function pathStyle(): PathStyle {
  const id = (globalThis as { __pathStyle?: string }).__pathStyle ?? opt('paths') ?? 'e';
  return PATH_STYLES[id] ?? PATH_STYLES.e;
}
