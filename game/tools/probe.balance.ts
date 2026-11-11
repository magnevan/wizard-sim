/**
 * Spell-audit probe (temporary, 2026-11-11): measures any queue x cast on 135-HP bodies, restoring their
 * health every tick so they never die, and records damage, seconds denied action (stunned, frozen or
 * knocked down) per target, the mean chill, and how far they were moved. Writes tools/probe-report.json.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { rules, type Element } from '@wizard-sim/rules';
import { BTN, KIND, N_EL, NO_INPUT, RHYTHM, compile, createWorld, elementId, quantize, step, type PlayerInput, type World } from '../packages/sim/src';

type Cast = 'force' | 'area' | 'place';
const HP = 135;
const L: Record<string, Element> = { W: 'water', F: 'fire', C: 'cold', L: 'lightning', A: 'arcane', E: 'earth', H: 'life', S: 'shield', G: 'sigil' };

function scene(dx: number, n: number): World {
  const w = createWorld(1, 1, { dummies: false });
  const b = w.bodies;
  b.x[0] = 0; b.y[0] = 0;
  for (let k = 0; k < n; k++) {
    const i = 8 + k;
    b.kind[i] = KIND.enemy; b.arch[i] = 0; b.team[i] = 2;
    b.x[i] = dx + (k % 3) * 0.7 - (n > 1 ? 0.7 : 0); b.y[i] = Math.floor(k / 3) * 0.7 - (n > 3 ? 0.35 : 0);
    b.r[i] = n > 1 ? 0.3 : 0.5; b.hp[i] = b.maxHp[i] = HP;
  }
  return w;
}

function run(code: string, cast: Cast, pack: number, wet = false) {
  const presses = [...code].flatMap((c) => (c === 'I' ? ['water', 'cold'] : [L[c]]) as Element[]);
  let q: Element[] = [];
  for (const e of presses) { const r = rules.addElement(q, e) as { queue: Element[]; kind: string | null }; if (r.kind === 'cancel' || r.kind === 'full') return null; q = r.queue; }
  const dx = cast === 'force' ? 3 : cast === 'area' ? 1.6 : 4;
  const w = scene(dx, pack);
  const spec = compile(q, cast);
  const b = w.bodies;
  if (wet) for (let i = 8; i < 8 + pack; i++) b.wet[i] = 600;
  const x0 = Array.from({ length: pack }, (_, k) => [b.x[8 + k], b.y[8 + k]]);
  const aim = (o: Partial<PlayerInput> = {}) => [quantize({ ...NO_INPUT, aimX: dx * 32, aimY: 0, ...o })];
  let dmg = 0, denied = 0, chill = 0, ticks = 0, frozeAny = 0;
  const go = (inp: PlayerInput[]) => {
    step(w, inp); ticks++;
    for (let i = 8; i < 8 + pack; i++) {
      dmg += HP - b.hp[i]; b.hp[i] = HP;
      if (b.stun[i] || b.frozen[i] || b.down[i]) denied++;
      if (b.frozen[i]) frozeAny = 1;
      chill += b.chill[i];
      // hold them in place so knockback doesn't carry them out of a channel (moved distance is read from kx/ky below)
    }
  };
  let moved = 0;
  for (const e of presses) { for (let k = 0; k < N_EL; k++) w.seats.runes[k] = 9; go(aim({ press0: elementId(e) })); }
  const btn = cast === 'force' ? BTN.force : BTN.area;
  const hold = cast === 'place' ? 30 : spec.channel ? Math.round(RHYTHM.naturalChannel * 60) + 12 : spec.charge ? 70 : 2;
  const start = ticks;
  for (let t = 0; t < hold; t++) go(aim({ buttons: btn }));
  for (let t = 0; t < (cast === 'place' ? 780 : 300); t++) go(aim()); // floors and fog last 8-12 s
  for (let k = 0; k < pack; k++) moved += Math.hypot(b.x[8 + k] - x0[k][0], b.y[8 + k] - x0[k][1]);
  const secs = (ticks - start) / 60;
  return { title: spec.title, shape: spec.shape, dmg: Math.round(dmg), perTarget: Math.round(dmg / pack), deniedS: +(denied / 60 / pack).toFixed(2), chill: +(chill / ticks / pack).toFixed(2), moved: +(moved / pack).toFixed(1), froze: frozeAny, window: +secs.toFixed(1) };
}

const SETS: Record<string, string[]> = {
  sprays: ['F', 'FF', 'FFF', 'C', 'CC', 'CCC', 'W', 'WW', 'WF', 'WFF', 'WWF', 'WC', 'WCC', 'WWC'],
  lightning: ['L', 'LL', 'LLL', 'LF', 'LFF', 'LLF', 'LC', 'LCC', 'LFC'.replace('C', ''), 'LA'.replace('A', 'F')],
  arcane: ['A', 'AA', 'AAA', 'AF', 'AAF', 'AFF', 'AL', 'AAL', 'ALL', 'AC', 'AW', 'AE'.replace('E', 'L'), 'AFL', 'AFW', 'ALC', 'ACW'],
  ice: ['I', 'II', 'IW', 'IC', 'IIW', 'IL', 'ILL', 'IA'.replace('A', 'E'), 'EI', 'EEI', 'EII', 'AI', 'AAI', 'AII', 'LI'],
  coldmix: ['EC', 'ECC', 'AC', 'LC', 'CCC'],
  earth: ['E', 'EE', 'EEE', 'EF', 'EEF', 'EFF', 'EA', 'EEA', 'EAA', 'EC', 'ECC', 'EW', 'EWC', 'EFA', 'ECA', 'EWF'],
};

it('probes the spells', () => {
  const out: Record<string, unknown> = {};
  for (const [set, codes] of Object.entries(SETS)) for (const code of [...new Set(codes)]) for (const cast of ['force', 'area', 'place'] as Cast[]) {
    const one = run(code, cast, 1), pack = run(code, cast, 5), wet = run(code, cast, 1, true);
    if (!one) continue;
    out[`${set}|${code}|${cast}`] = { one, pack, wetOne: wet };
  }
  writeFileSync(join(__dirname, 'probe-report.json'), JSON.stringify(out, null, 1));
  expect(Object.keys(out).length).toBeGreaterThan(10);
});

it('measures stun uptime by body size', () => {
  const rows: string[] = [];
  for (const code of ['L', 'LL', 'LLL', 'LLLL', 'AL', 'AAL']) for (const hp of [30, 135, 345, 2000]) {
    const w = scene(3, 1), b = w.bodies;
    b.hp[8] = b.maxHp[8] = hp;
    const presses = [...code].map((c) => L[c]);
    const aim = (o: Partial<PlayerInput> = {}) => [quantize({ ...NO_INPUT, aimX: 96, aimY: 0, ...o })];
    for (const e of presses) { for (let k = 0; k < N_EL; k++) w.seats.runes[k] = 9; step(w, aim({ press0: elementId(e) })); }
    let st = 0, n = 0;
    for (let t = 0; t < 1200; t++) { for (let k = 0; k < N_EL; k++) w.seats.runes[k] = 9; step(w, aim({ buttons: BTN.force })); b.hp[8] = hp; if (t > 30) { if (b.stun[8]) st++; n++; } }
    rows.push(`${code} ${hp} ${Math.round((100 * st) / n)}%`);
  }
  writeFileSync(join(__dirname, 'probe-stun.txt'), rows.join(String.fromCharCode(10)));
});

it('measures when an imbue beats more Life: Life + Fire against Life + Life, under part-fire damage', async () => {
  const { RES, taken } = await import('../packages/sim/src/guards');
  const { ARMS } = await import('../packages/sim/src/config');
  const keep = ARMS.blessDecay, rows: string[] = [];
  const endHp = (q: Element[], dps: number, f: number, secs: number) => {
    const w = createWorld(1, 1, { dummies: false }), b = w.bodies;
    b.maxHp[0] = 1000; b.hp[0] = 500; // no cap: every point of healing counts
    const aim = (o: Partial<PlayerInput> = {}) => [quantize({ ...NO_INPUT, aimX: 32, aimY: 0, ...o })];
    for (const e of q) { for (let k = 0; k < N_EL; k++) w.seats.runes[k] = 9; step(w, aim({ press0: elementId(e) })); }
    for (let t = 0; t < secs * 60; t++) {
      step(w, t < 2 ? aim({ buttons: BTN.area }) : aim());
      b.hp[0] -= (dps / 60) * (f * taken(w, 0, RES.fire) + (1 - f));
    }
    return b.hp[0];
  };
  const keepRate = ARMS.blessRate;
  for (const [rate, decay] of [[ARMS.blessRate, ARMS.blessDecay]]) { // the live numbers (a sweep: list other pairs here)
    ARMS.blessDecay = decay; ARMS.blessRate = rate;
    for (const dps of [6, 10, 15]) {
      const cells: string[] = [];
      for (const f of [0.25, 0.5, 0.75, 1]) {
        const gain = endHp(['life', 'fire'], dps, f, 20) - endHp(['life', 'life'], dps, f, 20);
        cells.push(`fire ${Math.round(f * 100)}%: ${gain >= 0 ? '+' : ''}${Math.round(gain)}`);
      }
      rows.push(`rate ${rate}, decay ${decay}/s (half-life ${(Math.log(2) / decay).toFixed(1)} s), ${dps} dps:  ${cells.join('   ')}`);
    }
  }
  ARMS.blessDecay = keep; ARMS.blessRate = keepRate;
  writeFileSync(join(__dirname, 'probe-imbue.txt'), rows.join(String.fromCharCode(10)));
});

it('measures effective healing on three hurt wizards', () => {
  const rows: string[] = [];
  for (const code of ['H', 'HH', 'HHH', 'HHHH', 'HL', 'HC', 'HI', 'HIC', 'HE', 'HF', 'HW', 'HLL', 'HEE']) for (const cast of ['force', 'area', 'place'] as Cast[]) for (const spread of [false, true]) {
    if (spread && cast !== 'force') continue;
    const dx = cast === 'force' ? 3 : cast === 'area' ? 1.2 : 4;
    const w = createWorld(1, 3, { dummies: false }), b = w.bodies;
    b.x[0] = 0; b.y[0] = 0; b.x[1] = dx; b.y[1] = 0; b.x[2] = dx + 0.5; b.y[2] = 0.9;
    if (spread) { b.x[1] = 5; b.y[1] = 1.6; b.x[2] = 7; b.y[2] = -2.2; } // a scattered team: allies off to either side of the aim
    b.kind[8] = KIND.enemy; b.arch[8] = 0; b.team[8] = 2; b.x[8] = dx + 0.5; b.y[8] = -0.9; b.r[8] = 0.4; b.maxHp[8] = 100;
    if (spread) { b.x[8] = 2.5; b.y[8] = -4; } // the enemy off to the side, out of the shots
    for (const i of [0, 1, 2, 8]) b.hp[i] = 40;
    const presses = [...code].flatMap((c) => (c === 'I' ? ['water', 'cold'] : [L[c]]) as Element[]);
    const spec = compile([...code].map((c) => (c === 'I' ? 'ice' : L[c])) as Element[], cast);
    const aim = (o: Partial<PlayerInput> = {}) => [quantize({ ...NO_INPUT, aimX: (spread ? 5.5 : dx) * 32, aimY: 0, ...o }), NO_INPUT, NO_INPUT];
    for (const e of presses) { for (let k = 0; k < N_EL; k++) w.seats.runes[k] = 9; step(w, aim({ press0: elementId(e) })); }
    const btn = cast === 'force' ? BTN.force : BTN.area;
    const hold = cast === 'place' ? 30 : spec.channel ? Math.round(RHYTHM.naturalChannel * 60) + 12 : spec.charge ? 70 : 2;
    const sum = () => b.hp[0] + b.hp[1] + b.hp[2];
    const hp0 = sum();
    let at3 = 0;
    for (let t = 0; t < 600; t++) {
      step(w, t < hold ? aim({ buttons: btn }) : aim());
      if (t === 180) at3 = sum() - hp0;
    }
    rows.push(`${code.padEnd(5)} ${(cast + (spread ? '*' : '')).padEnd(7)} ${spec.title.padEnd(16)} 3s ${Math.round(at3)}  10s ${Math.round(sum() - hp0)}  self ${Math.round(b.hp[0] - 40)}  enemy +${Math.round(b.hp[8] - 40)}`);
  }
  writeFileSync(join(__dirname, 'probe-heal.txt'), rows.join(String.fromCharCode(10)));
});
