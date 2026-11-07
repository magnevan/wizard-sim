/**
 * The rune-scaling audit (npm run scaling): what each extra rune buys, measured in the game itself.
 * Writes tools/scaling-report.json (read by docs/explorations/2026-11-07-rune-scaling.md).
 *
 * 1. Ladders: every damaging or healing form (Fire, Cold, Water, Lightning, Arcane, Earth, Life) cast
 *    Force, Area and Place with 1 to 5 runes of itself, at one sturdy dummy and at a pack of 5. Force
 *    channels are held for their natural duration (a beam's grows with its runes), rocks fully charged.
 *    Recorded: damage (or healing), runes spent, seconds from the first rune press to the end of the
 *    recovery, and from them damage per rune and per second, and the marginal gain of the last rune.
 * 2. Second rune: for each form and cast, the one-rune spell against every two-rune spell that keeps
 *    that form (another rune of it, or any element that doesn't take the form over or cancel). That is
 *    the choice a player makes most often: double up, or mix something in.
 *
 * Runes are topped up before each press, so pool size never decides what a ladder can reach; what is
 * spent is still counted. Statuses that tick after the hit (burn) are counted up to 4 s after the cast.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { rules, type Element } from '@wizard-sim/rules';
import { BTN, KIND, N_EL, NO_INPUT, RHYTHM, compile, createWorld, elementId, quantize, step, type PlayerInput, type World } from '../packages/sim/src';
import { scaleLine, spellNumbers } from '../packages/client/src/help-model';

type Cast = 'force' | 'area' | 'place';
const CASTS: Cast[] = ['force', 'area', 'place'];
const FORMS: Element[] = ['fire', 'cold', 'water', 'lightning', 'arcane', 'earth', 'life'];
const ELS = rules.BASE as Element[];
const DUMMY_HP = 1e6;

/** One wizard at the origin and `n` dummies around (dx, 0); a hurt ally beside them for Life. */
function scene(dx: number, n: number, ally: boolean): World {
  const w = createWorld(1, 1, { dummies: false });
  const b = w.bodies;
  b.x[0] = 0; b.y[0] = 0;
  for (let k = 0; k < n; k++) {
    const i = 8 + k;
    b.kind[i] = KIND.enemy; b.arch[i] = 0; b.team[i] = 2;
    b.x[i] = dx + (k % 3) * 0.7 - (n > 1 ? 0.7 : 0); b.y[i] = Math.floor(k / 3) * 0.7 - (n > 3 ? 0.35 : 0);
    b.r[i] = n > 1 ? 0.3 : 0.5; b.hp[i] = b.maxHp[i] = DUMMY_HP;
  }
  if (ally) { b.kind[20] = KIND.wizard; b.team[20] = 1; b.x[20] = dx; b.y[20] = 0; b.r[20] = 0.45; b.hp[20] = 1; b.maxHp[20] = DUMMY_HP; }
  return w;
}

interface Run { damage: number; heal: number; runes: number; seconds: number }

function run(queue: Element[], cast: Cast, pack: number): Run {
  const dx = cast === 'force' ? 3 : cast === 'area' ? 1.6 : 4;
  const heals = compile(queue, cast).heal;
  const w = scene(dx, heals ? 0 : pack, heals);
  const spec = compile(queue, cast);
  const aim = (o: Partial<PlayerInput> = {}) => [quantize({ ...NO_INPUT, aimX: dx * 32, aimY: 0, ...o })];
  // Pools are refilled past their max before each press (a ladder reaches 5 of anything); the sim
  // clamps them back each tick, so spending is read from the queue: one rune a press (no channel here
  // runs past its free time, so no upkeep is paid).
  const runes = queue.length;
  const top = () => { for (let k = 0; k < N_EL; k++) w.seats.runes[k] = 9; };
  const go = (inp: PlayerInput[]) => step(w, inp);
  const start = w.clock[0];
  for (const e of queue) { top(); go(aim({ press0: elementId(e) })); }
  const btn = cast === 'force' ? BTN.force : BTN.area;
  const hold = cast === 'place' ? 30 : spec.channel ? Math.round(RHYTHM.naturalChannel * 60 * (spec.shape === 'beam' ? spec.formN : 1)) + 12 : spec.charge ? 70 : 2;
  for (let t = 0; t < hold; t++) go(aim({ buttons: btn }));
  let busyEnd = w.clock[0];
  for (let t = 0; t < 900; t++) { go(aim()); if (w.seats.phase[0] !== 0 && busyEnd < w.clock[0]) busyEnd = w.clock[0]; }
  let damage = 0;
  for (let i = 8; i < 8 + pack; i++) if (w.bodies.kind[i] === KIND.enemy) damage += DUMMY_HP - w.bodies.hp[i];
  const heal = heals ? w.bodies.hp[20] - 1 : 0;
  return { damage, heal, runes, seconds: (busyEnd - start + 1) / 60 };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A queue from presses, through the rules (so a cancel shows): null if any press cancels or overflows. */
function build(presses: Element[]): Element[] | null {
  let q: Element[] = [];
  for (const e of presses) {
    const r = rules.addElement(q, e);
    if (r.event) return null;
    q = r.queue;
  }
  return q;
}

interface Step {
  n: number; title: string; shape: string; value: number; crowd: number; runes: number; seconds: number;
  perRune: number; perSecond: number; gain: number | null;
  /** From the help panel (spellNumbers, scaleLine): the reach it states, and what it says the next rune adds. */
  reach: number | null; help: string;
}

/**
 * Damage, or healing for Life. Water deals neither and the dummies are fixed bodies (knockback can't
 * show), so its ladder is read from the reach column; its second-rune table shows what a mix adds.
 */
const valueOf = (heals: boolean, r: Run) => (heals ? r.heal : r.damage);

function ladder(form: Element, cast: Cast) {
  const steps: Step[] = [];
  let last = 0;
  for (let n = 1; n <= 5; n++) {
    const q = build(Array(n).fill(form));
    if (!q) break;
    const spec = compile(q, cast);
    const one = run(q, cast, 1);
    const crowd = spec.heal ? null : run(q, cast, 5);
    const value = valueOf(spec.heal, one);
    const reach = spellNumbers(q, cast, spec).metrics.find((m) => m.key === 'reach');
    steps.push({
      n, title: spec.title, shape: spec.shape, value: r1(value), crowd: r1(crowd ? crowd.damage : 0), runes: r2(one.runes), seconds: r2(one.seconds),
      perRune: r1(value / Math.max(0.5, one.runes)), perSecond: r1(value / Math.max(0.1, one.seconds)), gain: n === 1 || last <= 0 ? null : r2(value / last),
      reach: reach ? r1(reach.v) : null, help: scaleLine(q, cast),
    });
    last = value;
  }
  return { form, cast, heals: compile([form], cast).heal, steps };
}

function second(form: Element, cast: Cast) {
  const base = run([form], cast, 1), baseCrowd = run([form], cast, 5);
  const heals = compile([form], cast).heal;
  const v0 = valueOf(heals, base), c0 = baseCrowd.damage;
  const rows: { add: Element; title: string; value: number; crowd: number; gain: number | null; crowdGain: number | null }[] = [];
  for (const add of ELS) {
    const q = build([form, add]);
    if (!q) continue;
    const spec = compile(q, cast);
    if (spec.form !== elementId(form)) continue; // it took the form over: a different spell, not a second rune
    const one = run(q, cast, 1), crowd = spec.heal ? null : run(q, cast, 5);
    const v = valueOf(spec.heal, one), c = crowd ? crowd.damage : 0;
    rows.push({ add, title: spec.title, value: r1(v), crowd: r1(c), gain: v0 > 0 ? r2(v / v0) : null, crowdGain: c0 > 0 ? r2(c / c0) : null });
  }
  return { form, cast, heals, base: r1(v0), baseCrowd: r1(c0), rows };
}

it('rune scaling report', () => {
  const ladders = FORMS.flatMap((f) => CASTS.map((c) => ladder(f, c)));
  const seconds = FORMS.flatMap((f) => CASTS.map((c) => second(f, c)));
  writeFileSync(join(__dirname, 'scaling-report.json'), JSON.stringify({ generated: 'npm run scaling', ladders, second: seconds }, null, 1));
  for (const l of ladders) {
    console.log(`\n${l.form} ${l.cast}${l.heals ? ' (heal)' : ''}`);
    console.table(l.steps.map((s) => ({ n: s.n, spell: s.title, shape: s.shape, value: s.value, crowd: s.crowd, runes: s.runes, sec: s.seconds, perRune: s.perRune, perSec: s.perSecond, gain: s.gain })));
  }
  for (const s of seconds) console.log(`${s.form} ${s.cast}: base ${s.base} | ` + s.rows.map((r) => `+${r.add} x${r.gain} (crowd x${r.crowdGain})`).join(', '));
  expect(ladders.length).toBe(FORMS.length * CASTS.length);
}, 600_000);
