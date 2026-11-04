/**
 * The balance harness: measures what the current numbers actually do, and writes
 * tools/balance-report.json (read by the balance doc). Run: npm run balance
 *
 * 1. Spells: each common queue is cast at a sturdy dummy (Force from 3 u, Area beside it, Place
 *    on it), channels held for their natural duration. We record damage, healing, runes spent and
 *    seconds busy, and the same spell against a pack of 5 goblin-sized dummies (its crowd value).
 * 2. Time to kill each archetype, from the measured damage per second, both burst (pools full)
 *    and sustained (limited by rune regen).
 * 3. Enemies: how fast each archetype kills a wizard who just stands there.
 * 4. Waves: two bot pilots in the Arena for 5 minutes under the current numbers and a few
 *    alternatives, to see which knobs move survival the most.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import {
  ARCHETYPES, BTN, KIND, NO_INPUT, RHYTHM, RUNES, applyOverrides, botInput, compile, createWorld, elementId, newBotMemory,
  quantize, resetTuning, step, type PlayerInput, type World,
} from '../packages/sim/src';

const QUEUES: [Element[], 'force' | 'area' | 'place'][] = [
  [['fire'], 'force'], [['fire', 'fire'], 'force'], [['arcane'], 'force'], [['arcane', 'arcane'], 'force'], [['arcane', 'fire'], 'force'],
  [['lightning'], 'force'], [['lightning', 'lightning'], 'force'], [['cold'], 'force'], [['cold', 'cold'], 'force'], [['water'], 'force'],
  [['earth'], 'force'], [['earth', 'earth'], 'force'], [['earth', 'fire'], 'force'], [['earth', 'earth', 'earth'], 'force'], [['water', 'cold'], 'force'],
  [['earth', 'arcane'], 'force'], [['earth', 'cold'], 'force'],
  [['fire'], 'area'], [['arcane'], 'area'], [['earth'], 'area'], [['lightning'], 'area'], [['cold', 'cold'], 'area'],
  [['fire'], 'place'], [['arcane'], 'place'], [['earth', 'arcane'], 'place'], [['lightning'], 'place'], [['water', 'fire'], 'place'],
  [['life'], 'force'], [['life', 'life'], 'area'], [['life', 'lightning'], 'force'],
];

const DUMMY_HP = 1e6;

/** One wizard at the origin and `n` dummies around (dx, 0). Dummies don't reset in the harness. */
function range(dx: number, n = 1): World {
  const w = createWorld(1, 1, { dummies: false });
  w.bodies.x[0] = 0; w.bodies.y[0] = 0;
  for (let k = 0; k < n; k++) {
    const i = 8 + k, b = w.bodies;
    b.kind[i] = KIND.enemy; b.arch[i] = 0; b.team[i] = 2; // a standing target: archetype 0 has no AI that acts
    b.x[i] = dx + (k % 3) * 0.7 - (n > 1 ? 0.7 : 0); b.y[i] = Math.floor(k / 3) * 0.7 - (n > 3 ? 0.35 : 0);
    b.r[i] = n > 1 ? 0.3 : 0.5; b.hp[i] = b.maxHp[i] = DUMMY_HP;
  }
  return w;
}

interface Measure { title: string; queue: string; cast: string; runes: number; seconds: number; damage: number; heal: number; crowd: number; dps: number; perRune: number }

function measure(queue: Element[], cast: 'force' | 'area' | 'place', pack: number): { damage: number; heal: number; seconds: number; runes: number } {
  const dx = cast === 'force' ? 3 : cast === 'area' ? 1.6 : 4;
  const w = range(dx, pack);
  const allyHurt = queue.includes('life');
  if (allyHurt) { // a hurt ally to heal, standing in front
    w.bodies.kind[20] = KIND.wizard; w.bodies.team[20] = 1; w.bodies.x[20] = dx; w.bodies.y[20] = 0.9; w.bodies.r[20] = 0.45; w.bodies.hp[20] = 1; w.bodies.maxHp[20] = DUMMY_HP;
  }
  const spec = compile(queue, cast);
  const aim = (o: Partial<PlayerInput> = {}) => [quantize({ ...NO_INPUT, aimX: dx * 32, aimY: 0, ...o })];
  let runes = 0, prev = w.seats.runes.slice(0, 9);
  const tickRunes = () => { const cur = w.seats.runes.slice(0, 9); for (let k = 0; k < 9; k++) runes += Math.max(0, prev[k] - cur[k]); prev = cur; };
  const go = (inp: PlayerInput[]) => { step(w, inp); tickRunes(); };
  for (const e of queue) go(aim({ press0: elementId(e) }));
  const start = w.clock[0];
  const btn = cast === 'force' ? BTN.force : BTN.area;
  const hold = cast === 'place' ? 30 : spec.channel ? Math.round(RHYTHM.naturalChannel * 60 * (spec.shape === 'beam' ? spec.formN : 1)) + 12 : spec.charge ? 70 : 2;
  for (let t = 0; t < hold; t++) go(aim({ buttons: btn }));
  let busyEnd = w.clock[0];
  for (let t = 0; t < 240; t++) { go(aim()); if (w.seats.phase[0] !== 0 && busyEnd < w.clock[0]) busyEnd = w.clock[0]; }
  let damage = 0, heal = 0;
  for (let i = 8; i < 8 + pack; i++) damage += DUMMY_HP - w.bodies.hp[i];
  if (allyHurt) heal = w.bodies.hp[20] - 1;
  return { damage, heal, seconds: (busyEnd - start + queue.length) / 60, runes };
}

function spells(): Measure[] {
  return QUEUES.map(([q, cast]) => {
    const one = measure(q, cast, 1), crowd = q.includes('life') ? { damage: 0 } : measure(q, cast, 5);
    const title = compile(q, cast).title;
    return {
      title, queue: q.join('+'), cast, runes: Math.round(one.runes * 100) / 100, seconds: Math.round(one.seconds * 100) / 100,
      damage: Math.round(one.damage), heal: Math.round(one.heal), crowd: Math.round(crowd.damage),
      dps: Math.round(one.damage / Math.max(0.1, one.seconds)), perRune: Math.round(one.damage / Math.max(0.5, one.runes)),
    };
  });
}

/** Two bots in the Arena for `seconds`, under `tuning`. */
function arenaOnce(tuning: Record<string, number>, shift: number, seconds: number) {
  resetTuning(); applyOverrides(tuning);
  const w = createWorld(5, 2, { room: 'arena' });
  w.bodies.x[0] += shift; w.bodies.x[1] -= shift * 0.7; w.bodies.y[1] += shift * 0.5;
  const mem = [newBotMemory(), newBotMemory()];
  let kills = 0, downs = 0, wipes = 0, dmgTaken = 0;
  const clears: number[] = [];
  let waveStart = 0;
  for (let t = 0; t < seconds * 60; t++) {
    const hp0 = w.bodies.hp[0] + w.bodies.hp[1];
    step(w, [botInput(w, 0, mem[0]), botInput(w, 1, mem[1])]);
    dmgTaken += Math.max(0, hp0 - (w.bodies.hp[0] + w.bodies.hp[1]));
    for (const e of w.events) {
      if (e.text === 'dies') kills++;
      if (e.text === 'downed') downs++;
      if (e.text === 'Wiped') wipes++;
      if (e.who === -1 && e.text?.startsWith('Wave')) waveStart = t;
      if (e.text === 'Cleared') clears.push(Math.round((t - waveStart) / 6) / 10);
    }
  }
  resetTuning();
  return { cleared: w.enc.state[3], kills, downs, wipes, damageTaken: Math.round(dmgTaken), clearSeconds: clears };
}

/** Four runs from slightly different start spots: mean and range of waves cleared. */
function arena(tuning: Record<string, number>, seconds = 300) {
  const runs = [0, 0.37, 0.81, 1.23].map((sh) => arenaOnce(tuning, sh, seconds));
  const mean = (f: (r: (typeof runs)[0]) => number) => Math.round((runs.reduce((a, r) => a + f(r), 0) / runs.length) * 10) / 10;
  return {
    cleared: mean((r) => r.cleared), clearedMin: Math.min(...runs.map((r) => r.cleared)), clearedMax: Math.max(...runs.map((r) => r.cleared)),
    downs: mean((r) => r.downs), wipes: mean((r) => r.wipes), kills: mean((r) => r.kills), damageTaken: mean((r) => r.damageTaken),
    clearSeconds: runs[0].clearSeconds,
  };
}

it('balance report', () => {
  const spellRows = spells();
  // Time to kill: burst uses the spell's own dps; sustained divides by how long the runes take to come back.
  const ttk = ARCHETYPES.filter((a) => a.id !== 'none').map((a) => ({
    archetype: a.name, hp: a.hp,
    spells: spellRows.filter((s) => s.damage > 0 && s.cast === 'force').map((s) => {
      const castsToKill = a.hp / Math.max(1, s.damage);
      const regenSeconds = s.runes / (RUNES.regen * Math.max(1, new Set(s.queue.split('+')).size));
      return { spell: s.title, burst: Math.round((castsToKill * s.seconds) * 10) / 10, sustained: Math.round(castsToKill * Math.max(s.seconds, regenSeconds) * 10) / 10 };
    }),
  }));
  const threat = ARCHETYPES.filter((a) => a.id !== 'none').map((a) => {
    const cycle = a.windup + a.cooldown;
    return { archetype: a.name, damage: a.damage, cycle: Math.round(cycle * 100) / 100, dps: Math.round((a.damage / cycle) * 10) / 10, secondsToKillWizard: Math.round((100 / (a.damage / cycle)) * 10) / 10, speed: a.speed };
  });
  const variants: [string, Record<string, number>][] = [
    ['current', {}],
    ['slower regen (0.15)', { 'runes.regen': 0.15 }],
    ['faster regen (0.3)', { 'runes.regen': 0.3 }],
    ['enemies hit 1.5x harder', Object.fromEntries(ARCHETYPES.filter((a) => a.id !== 'none').map((a) => [`enemy.${a.id}.damage`, a.damage * 1.5]))],
    ['enemies 1.5x tougher', Object.fromEntries(ARCHETYPES.filter((a) => a.id !== 'none').map((a) => [`enemy.${a.id}.hp`, a.hp * 1.5]))],
    ['heavier casts (windup x2)', { 'rhythm.windup': RHYTHM.windup * 2, 'rhythm.windupPerRune': RHYTHM.windupPerRune * 2 }],
  ];
  const waves = variants.map(([name, t]) => ({ name, ...arena(t) }));
  const report = { generated: 'npm run balance', regen: RUNES.regen, max: RUNES.max, spells: spellRows, ttk, threat, waves };
  writeFileSync(join(__dirname, 'balance-report.json'), JSON.stringify(report, null, 1));
  console.table(spellRows.map((s) => ({ spell: s.title, cast: s.cast, runes: s.runes, sec: s.seconds, dmg: s.damage, crowd: s.crowd, dps: s.dps, perRune: s.perRune, heal: s.heal })));
  console.table(waves);
  expect(spellRows.length).toBe(QUEUES.length);
}, 600_000);
