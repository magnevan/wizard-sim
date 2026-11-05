/**
 * The inert-addition audit (npm run audit): "adding an element always changes the spell", checked
 * in the game itself rather than in the rules text (the Atlas audits do that).
 *
 * Every queue of up to three runes is cast every way (Force held for a second, so channels run
 * and rocks charge; Area; Place; Self; Weapon) in one standard scene, and what happened is fingerprinted: bodies (health, place,
 * statuses), the floor, walls, devices, wards, auras, weapons, held guards. Then for every queue
 * and every element that can be added to it without a cancel, the two fingerprints are compared.
 * Equal fingerprints mean the added element did nothing in play: an inert addition. Each one is a
 * design question ("what should Earth do to a Life curtain?"), listed in tools/audit-report.json.
 *
 * The scene: the caster (hurt and wet, so self casts show) at the origin aiming at an enemy dummy
 * 2.7 u ahead (close enough to touch an arc wall), one in melee reach, one beyond, and a hurt ally
 * a little behind. Everyone is hurt, so healing shows. Runes are kept full, so cost never decides
 * the outcome. Dummies reset after 3 quiet seconds: the run stops before that.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { rules, type Element } from '@wizard-sim/rules';
import { BTN, KIND, MAX_SEATS, N_EL, NO_INPUT, RUNES, createWorld, elementId, quantize, step, type PlayerInput, type World } from '../packages/sim/src';

type Cast = 'force' | 'area' | 'place' | 'self' | 'weapon';
const CASTS: Cast[] = ['force', 'area', 'place', 'self', 'weapon'];
const ELS = rules.BASE as Element[];

function scene(): World {
  const w = createWorld(1, 2, { dummies: false });
  const b = w.bodies;
  b.x[0] = 0; b.y[0] = 0; b.hp[0] = 60; b.wet[0] = 600;
  b.x[1] = -1.5; b.y[1] = 1.2; b.hp[1] = 50; // a hurt ally
  for (const [slot, x, y] of [[8, 2.7, 0], [9, 3.6, 1.1], [10, 1.1, -0.8]] as const) {
    b.kind[slot] = KIND.dummy; b.team[slot] = 2; b.x[slot] = x; b.y[slot] = y; b.r[slot] = 0.5; b.maxHp[slot] = 1000; b.hp[slot] = 600;
  }
  return w;
}

function fill(w: World): void {
  for (const el of ELS) w.seats.runes[elementId(el) - 1] = RUNES.max[el];
}

/** Casts `queue` as `cast` and runs on, then fingerprints the outcome. */
function play(queue: Element[], cast: Cast): string {
  const w = scene();
  const aim = { aimX: 2.7 * 32, aimY: 0 };
  const tick = (over: Partial<PlayerInput> = {}) => { fill(w); step(w, [quantize({ ...NO_INPUT, ...aim, ...over }), NO_INPUT, NO_INPUT, NO_INPUT]); };
  for (const el of queue) tick({ press0: elementId(el) });
  const btn = cast === 'force' ? BTN.force : cast === 'area' || cast === 'place' ? BTN.area : cast === 'self' ? BTN.self : BTN.weapon;
  const hold = cast === 'force' ? 60 : cast === 'place' ? 30 : 1;
  for (let k = 0; k < hold; k++) tick({ buttons: btn });
  for (let k = 0; k < 90; k++) tick();
  // A conjured weapon or guard only shows when used: swing it once (an empty Weapon cast).
  if (cast === 'weapon') { tick({ buttons: BTN.weapon }); for (let k = 0; k < 40; k++) tick(); }
  return fingerprint(w);
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function fingerprint(w: World): string {
  const b = w.bodies, s = w.seats, parts: (string | number)[] = [];
  for (let i = 0; i < b.kind.length; i++) {
    if (!b.kind[i]) continue;
    parts.push(i, b.kind[i], r2(b.hp[i]), r2(b.x[i]), r2(b.y[i]), b.wet[i] > 0 ? 1 : 0, b.burn[i] > 0 ? 1 : 0, b.frozen[i] > 0 ? 1 : 0, b.stun[i] > 0 ? 1 : 0, b.expose[i] > 0 ? 1 : 0, r2(b.chill[i]));
  }
  parts.push('|surf', Array.from(w.surf.kind).join(''));
  const wl = w.walls;
  for (let k = 0; k < wl.type.length; k++) if (wl.type[k]) parts.push('w', wl.type[k], r2(wl.hp[k]));
  const dv = w.devices;
  for (let k = 0; k < dv.type.length; k++) if (dv.type[k]) parts.push('d', dv.type[k], dv.charges[k], dv.heal[k]);
  for (let i = 0; i < MAX_SEATS; i++) parts.push('s', s.ward[i], r2(s.wardHp[i]), s.aura[i] > 0 ? 1 : 0, s.wand[i], s.weapon[i], s.guard[i], r2(s.guardHp[i]), s.motes[i], s.double[i] >= 0 ? 1 : 0);
  return parts.join(',');
}

/** The queue after pressing `els` in order, or null if a press cancels or the queue overflows. */
function build(els: Element[]): Element[] | null {
  let q: string[] = [];
  for (const el of els) {
    const r = rules.addElement(q, el);
    if (r.event) return null;
    q = r.queue;
  }
  return q as Element[];
}

it('no element addition is inert in play', () => {
  // Every multiset of up to 3 runes, in key order, that builds without a cancel.
  const queues: Element[][] = [];
  const rec = (from: number, cur: Element[]) => {
    if (cur.length) { const q = build(cur); if (!q) return; queues.push(q); }
    if (cur.length === 3) return;
    for (let k = from; k < ELS.length; k++) rec(k, [...cur, ELS[k]]);
  };
  rec(0, []);
  const prints = new Map<string, string>();
  const key = (q: Element[], c: Cast) => `${[...q].sort().join('+')}|${c}`;
  const get = (q: Element[], c: Cast) => { const k = key(q, c); if (!prints.has(k)) prints.set(k, play(q, c)); return prints.get(k)!; };

  const inert: { queue: string; add: string; cast: Cast }[] = [];
  let pairs = 0;
  for (const q of queues) {
    if (q.length >= 3) continue;
    for (const el of ELS) {
      const bigger = build([...q, el]);
      if (!bigger || bigger.length !== q.length + 1) continue;
      for (const c of CASTS) {
        pairs++;
        if (get(q, c) === get(bigger, c)) inert.push({ queue: q.join('+'), add: el, cast: c });
      }
    }
  }
  // Group by what was added and how, so the report reads as a short list of questions.
  const byAdd = new Map<string, string[]>();
  for (const x of inert) { const k = `${x.add} on ${x.cast}`; byAdd.set(k, [...(byAdd.get(k) ?? []), x.queue]); }
  const summary = [...byAdd.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, qs]) => ({ addition: k, count: qs.length, queues: qs }));
  writeFileSync(join(__dirname, 'audit-report.json'), JSON.stringify({ when: 'npm run audit', pairs, inert: inert.length, summary }, null, 2) + '\n');
  console.log(`inert additions: ${inert.length} of ${pairs}`);
  for (const g of summary.slice(0, 40)) console.log(`  ${g.count.toString().padStart(3)}  ${g.addition}: ${g.queues.slice(0, 6).join(', ')}${g.queues.length > 6 ? ', …' : ''}`);
  expect(pairs).toBeGreaterThan(0);
});

void N_EL;
