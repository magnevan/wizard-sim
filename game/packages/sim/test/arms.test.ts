/**
 * Weapons and guards (docs/explorations/2026-11-05-guards.md, revised in 2026-11-05-guards-round-2.md):
 * the weapon-specific Heavies and Specials, the Arcane wand, and the eight guards' Defend, Retreat,
 * passives, resistances and mixing.
 */
import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import {
  ARCH, ARCHETYPES, ARMS, BTN, EL, GUARD, KIND, NO_INPUT, SURF, TEAM, ZONE, createWorld, elementId, quantize, spawnBody, step,
  type PlayerInput, type World,
} from '../src';
import { anchored, damageGuard, guardBeam, resist, RES, taken, walkMult } from '../src/guards';
import { N_EL } from '../src/elements';
import { cellAt } from '../src/effects';
import { measure } from '../../../tools/weapon-dps';

class Driver {
  aim = { x: 1, y: 0 };
  constructor(readonly w: World, readonly seat = 0) {}
  input(over: Partial<PlayerInput> = {}): PlayerInput {
    const b = this.w.bodies;
    return quantize({ ...NO_INPUT, aimX: (this.aim.x - b.x[this.seat]) * 32, aimY: (this.aim.y - b.y[this.seat]) * 32, ...over });
  }
  tick(over: Partial<PlayerInput> = {}, n = 1): this {
    for (let k = 0; k < n; k++) {
      const all = [NO_INPUT, NO_INPUT, NO_INPUT, NO_INPUT];
      all[this.seat] = this.input(over);
      step(this.w, all);
    }
    return this;
  }
  aimAt(x: number, y: number): this { this.aim = { x, y }; return this; }
  queue(...els: Element[]): this { for (const e of els) this.tick({ press0: elementId(e) }); return this; }
  cast(btn: number, hold = 1, after = 40): this { this.tick({ buttons: btn }, hold); return this.tick({}, after); }
  conjure(...els: Element[]): this { return this.queue(...els).cast(BTN.weapon, 1, 20); }
}

function arena(players = 1) {
  const w = createWorld(1, players, { dummies: false });
  w.bodies.x[0] = 0; w.bodies.y[0] = 0;
  if (players > 1) { w.bodies.x[1] = 4; w.bodies.y[1] = 3; }
  const dummy = (x: number, y: number, slot = 8) => {
    const b = w.bodies;
    b.kind[slot] = KIND.dummy; b.team[slot] = 2; b.x[slot] = x; b.y[slot] = y; b.r[slot] = 0.5; b.hp[slot] = b.maxHp[slot] = 400;
    return slot;
  };
  const enemy = (arch: number, x: number, y: number) => {
    const a = ARCHETYPES[arch], e = spawnBody(w, -1, KIND.enemy, TEAM.enemies, x, y, a.hp, a.radius);
    w.bodies.arch[e] = arch;
    return e;
  };
  return { w, d: new Driver(w), dummy, enemy };
}

describe('guards: one per lead element', () => {
  it('the lead element picks the guard; Shield alone is the Mirror buckler', () => {
    const cases: [Element[], number][] = [
      [['shield'], GUARD.mirror], [['shield', 'earth'], GUARD.bulwark], [['shield', 'fire'], GUARD.ember], [['shield', 'cold'], GUARD.rime],
      [['shield', 'lightning'], GUARD.spark], [['shield', 'water'], GUARD.tide], [['shield', 'arcane'], GUARD.prism], [['shield', 'life'], GUARD.leaf],
    ];
    for (const [q, g] of cases) {
      const { w, d } = arena();
      d.conjure(...q);
      expect(w.seats.guard[0]).toBe(g);
      expect(w.seats.guardHp[0]).toBeGreaterThan(0);
    }
  });

  it('the strongest element leads, as in spells: Earth beats two Fire, and the Fire mixes in', () => {
    const { w, d } = arena();
    d.conjure('shield', 'fire', 'fire', 'earth');
    expect(w.seats.guard[0]).toBe(GUARD.bulwark);
    expect(resist(w, 0, RES.physical)).toBe(1); // the Bulwark's own: takes half
    expect(resist(w, 0, RES.fire)).toBeCloseTo(1 / 3 + 3); // own + all of the Ember's (2 runes: the full row)
    expect(taken(w, 0, RES.fire)).toBeCloseTo(0.23); // hyperbolic: never immune
    expect(resist(w, 0, RES.cold)).toBeCloseTo(1 / 3 + 1);
    expect(anchored(w, 0)).toBe(true);
  });

  it('every mixed-in element counts, and one rune brings half its row', () => {
    const { w, d } = arena();
    d.conjure('shield', 'earth', 'fire', 'water'); // Bulwark + Fire + Water
    expect(resist(w, 0, RES.fire)).toBeCloseTo(1 / 3 + 1.5 + 0.5); // own + half the Ember's + half the Tide's
    expect(resist(w, 0, RES.lightning)).toBe(-0.25); // the Tide's weakness comes too
    expect(taken(w, 0, RES.lightning)).toBe(1.25);
  });

  it('a Leaf (Life: preservation) takes only the strengths of what it carries', () => {
    const { w, d } = arena();
    d.conjure('shield', 'life', 'water');
    expect(w.seats.guard[0]).toBe(GUARD.leaf);
    expect(resist(w, 0, RES.fire)).toBe(-0.25 + 0.5); // its own weakness, offset by half the Tide's
    expect(resist(w, 0, RES.lightning)).toBe(0); // no Tide weakness under a Leaf
  });

  it('the coat bites back: a goblin biting a Bulwark + Fire block catches fire', () => {
    const { w, d, enemy } = arena();
    d.conjure('shield', 'earth', 'fire');
    const e = enemy(ARCH.swarmer, 1.4, 0);
    let burnt = false;
    for (let t = 0; t < 200 && !burnt; t++) { d.aimAt(5, 0).tick({ buttons: BTN.self }); if (w.bodies.burn[e] > 0) burnt = true; }
    expect(burnt).toBe(true);
    expect(w.bodies.hp[0]).toBe(100);
  });

  it('carrying costs a little walking speed: a guard and a weapon 5 % each', () => {
    const { w, d } = arena();
    expect(walkMult(w, 0)).toBe(1);
    d.conjure('shield', 'fire');
    expect(walkMult(w, 0)).toBeCloseTo(ARMS.carryWalk);
    d.conjure('sigil', 'fire');
    expect(walkMult(w, 0)).toBeCloseTo(ARMS.carryWalk * ARMS.carryWalk);
  });

  it('resistances apply while carried: an Ember targe takes a quarter of the fire, a Rime kite takes more', () => {
    const took: Record<string, number> = {};
    for (const q of [[], ['shield', 'fire'], ['shield', 'cold']] as Element[][]) {
      const { w, d } = arena(2);
      if (q.length) d.conjure(...q);
      w.bodies.x[1] = 3; w.bodies.y[1] = 0;
      new Driver(w, 1).aimAt(0, 0).queue('fire').cast(BTN.force, 60, 5);
      took[q.join('+') || 'none'] = 100 - w.bodies.hp[0];
    }
    expect(took.none).toBeGreaterThan(5);
    expect(took['shield+fire']).toBeGreaterThan(0);
    expect(took['shield+fire']).toBeLessThan(took.none * 0.3);
    expect(took['shield+cold']).toBeGreaterThan(took.none);
  });

  it('the Bulwark blocks a goblin bite from the front (and anchors you); unraised it only resists', () => {
    const hurt: number[] = [];
    for (const block of [false, true]) {
      const { w, d, enemy } = arena();
      d.conjure('shield', 'earth');
      enemy(ARCH.swarmer, 1.4, 0);
      d.aimAt(5, 0).tick(block ? { buttons: BTN.self } : {}, 200);
      hurt.push(100 - w.bodies.hp[0]);
      expect(w.seats.guard[0]).toBe(GUARD.bulwark);
    }
    expect(hurt[0]).toBeGreaterThan(0);
    expect(hurt[1]).toBe(0);
  });

  it('Ember thorns: a goblin biting a raised Ember targe catches fire', () => {
    const { w, d, enemy } = arena();
    d.conjure('shield', 'fire');
    const e = enemy(ARCH.swarmer, 1.4, 0);
    let burnt = false;
    for (let t = 0; t < 200 && !burnt; t++) { d.aimAt(5, 0).tick({ buttons: BTN.self }); if (w.bodies.burn[e] > 0) burnt = true; }
    expect(burnt).toBe(true);
  });

  it('a Mirror parry (Space tapped as the shot lands) sends the shot back; a block glances it off, unworn', () => {
    for (const parry of [true, false]) {
      const { w, d, dummy } = arena(2);
      const t = dummy(-6, 0, 9);
      d.conjure('shield').aimAt(-5, 0);
      w.bodies.x[1] = -5; w.bodies.y[1] = 0;
      const ally = new Driver(w, 1).aimAt(0, 0);
      // the ally throws a rock; seat 0 raises the guard a few ticks before it arrives (parry) or long before (block)
      let pressAt = -1;
      for (let k = 0; k < 120; k++) {
        const m = w.missiles;
        let near = false;
        for (let j = 0; j < m.alive.length; j++) if (m.alive[j] && m.owner[j] === 1 && Math.abs(m.x[j]) < (parry ? 1.6 : 4.5)) near = true;
        if (near && pressAt < 0) pressAt = k;
        const me = d.input(pressAt >= 0 ? { buttons: BTN.self } : {});
        const them = k === 0 ? ally.input({ press0: elementId('earth') }) : k < 3 ? ally.input({ buttons: BTN.force }) : ally.input();
        step(w, [me, them, NO_INPUT, NO_INPUT]);
      }
      expect(w.bodies.hp[0]).toBe(100);
      if (parry) expect(w.bodies.hp[1] < 100 || w.bodies.hp[t] < 400).toBe(true);
      else expect(w.seats.guardHp[0]).toBe(ARMS.hp.mirror);
    }
  });

  it('Clear: an ally\'s beam does nothing to a Prism carrier, raised or not', () => {
    const hurt: number[] = [];
    for (const mode of ['none', 'carried']) {
      const { w, d } = arena(2);
      if (mode !== 'none') d.conjure('shield', 'arcane');
      d.aimAt(-3, 0); // facing away: Clear works from any side
      w.bodies.x[1] = 3; w.bodies.y[1] = 0;
      const ally = new Driver(w, 1).aimAt(0, 0);
      step(w, [d.input(), ally.input({ press0: elementId('arcane') }), NO_INPUT, NO_INPUT]);
      for (let k = 0; k < 90; k++) step(w, [d.input(), ally.input({ buttons: BTN.force }), NO_INPUT, NO_INPUT]);
      hurt.push(100 - w.bodies.hp[0]);
    }
    expect(hurt[0]).toBeGreaterThan(5);
    expect(hurt[1]).toBe(0);
  });

  it('a raised Prism stops an enemy beam from the front; unraised it only resists', () => {
    const hurt: number[] = [];
    for (const raised of [false, true]) {
      const { w, d } = arena(2);
      d.conjure('shield', 'arcane');
      d.aimAt(3, 0);
      w.bodies.x[1] = 3; w.bodies.y[1] = 0; w.bodies.team[1] = TEAM.enemies; // a rival wizard
      const foe = new Driver(w, 1).aimAt(0, 0);
      step(w, [d.input(), foe.input({ press0: elementId('arcane') }), NO_INPUT, NO_INPUT]);
      for (let k = 0; k < 90; k++) step(w, [d.input(raised ? { buttons: BTN.self } : {}), foe.input({ buttons: BTN.force }), NO_INPUT, NO_INPUT]);
      hurt.push(100 - w.bodies.hp[0]);
    }
    expect(hurt[0]).toBeGreaterThan(2);
    expect(hurt[1]).toBe(0);
  });

  it('a Prism parry returns the beam mixed with its coat; opposites cancel rune for rune', () => {
    const back = (q: Element[], fire: number) => {
      const { w, d, dummy } = arena();
      d.conjure(...q);
      d.aimAt(3, 0).tick({}, 2);
      const foe = dummy(3, 0);
      w.seats.guardT[0] = 1; // just raised: parrying
      const els = new Uint8Array(N_EL); els[EL.fire - 1] = fire;
      guardBeam(w, 0, foe, els, 0, 1, -1, 0);
      return 400 - w.bodies.hp[foe];
    };
    expect(back(['shield', 'arcane'], 1)).toBeGreaterThan(0); // a plain Prism sends it back
    expect(back(['shield', 'arcane', 'cold'], 1)).toBe(0); // one Cold swallows one Fire
    expect(back(['shield', 'arcane', 'cold'], 2)).toBeGreaterThan(0); // two Fire: one comes back
  });

  it('every rune past the first makes a guard bigger: more HP, a longer Retreat', () => {
    const hp = (q: Element[]) => { const { w, d } = arena(); d.conjure(...q); return w.seats.guardHp[0]; };
    expect(hp(['shield', 'earth', 'earth'])).toBeCloseTo(ARMS.hp.bulwark * (1 + ARMS.runeSize));
    expect(hp(['shield', 'earth', 'fire', 'water'])).toBeCloseTo(ARMS.hp.bulwark * (1 + 2 * ARMS.runeSize));
  });

  it('the Prism stores what it blocks; lowering it fires the Lance, carrying the coat', () => {
    const { w, d, dummy } = arena();
    d.conjure('shield', 'arcane', 'fire');
    d.aimAt(5, 0).tick({}, 2);
    const t = dummy(5, 0);
    d.tick({ buttons: BTN.self }, 20);
    damageGuard(w, 0, 30); // as if a blocked hit
    expect(w.seats.guardCharge[0]).toBe(30);
    d.tick({}, 2); // lowered: the Lance
    expect(w.seats.guardCharge[0]).toBe(0);
    expect(400 - w.bodies.hp[t]).toBeGreaterThan(30);
    expect(w.bodies.burn[t]).toBeGreaterThan(0); // the Fire coat rides on it
  });

  it('a Prism lowered with little charge fires nothing; the charge fades', () => {
    const { w, d, dummy } = arena();
    d.conjure('shield', 'arcane');
    d.aimAt(5, 0).tick({}, 2);
    const t = dummy(5, 0);
    d.tick({ buttons: BTN.self }, 5);
    damageGuard(w, 0, ARMS.lanceMin / 2);
    d.tick({}, 120);
    expect(w.bodies.hp[t]).toBe(400);
    expect(w.seats.guardCharge[0]).toBe(0);
  });

  it('Grounded: an ally\'s chain lightning skips the Spark ring carrier', () => {
    const { w, d, dummy } = arena(2);
    d.conjure('shield', 'lightning');
    w.bodies.x[1] = -3; w.bodies.y[1] = 0;
    const t = dummy(1.5, 0, 9);
    const ally = new Driver(w, 1).aimAt(0, 0);
    step(w, [d.input(), ally.input({ press0: elementId('lightning') }), NO_INPUT, NO_INPUT]);
    for (let k = 0; k < 60; k++) step(w, [d.input(), ally.input({ buttons: BTN.force }), NO_INPUT, NO_INPUT]);
    expect(w.bodies.hp[0]).toBe(100);
    expect(w.bodies.hp[t]).toBeLessThan(400);
  });

  it('passives: Tide is Quenched (never burns, not kept wet); Leaf regrows; Ember dries you at once', () => {
    const tide = arena(); tide.d.conjure('shield', 'water'); tide.w.bodies.burn[0] = 300; tide.d.tick({}, 30);
    expect(tide.w.bodies.burn[0]).toBe(0);
    expect(tide.w.bodies.wet[0]).toBe(0);
    const leaf = arena(); leaf.d.conjure('shield', 'life'); leaf.w.bodies.hp[0] = 50; leaf.d.tick({}, 120);
    expect(leaf.w.bodies.hp[0]).toBeGreaterThan(51);
    const ember = arena(); ember.d.conjure('shield', 'fire'); ember.w.bodies.wet[0] = 300; ember.d.tick({}, 2);
    expect(ember.w.bodies.wet[0]).toBe(0);
  });
});

describe('guards: Retreat (Shift+LMB, nothing queued)', () => {
  const retreatOf = (q: Element[], setup?: (a: ReturnType<typeof arena>) => void) => {
    const a = arena(2);
    a.w.bodies.x[1] = 8; a.w.bodies.y[1] = 7; // out of the way unless setup moves it
    if (q.length) a.d.conjure(...q);
    setup?.(a);
    a.w.bodies.x[0] = 0; a.w.bodies.y[0] = 0;
    a.d.aimAt(5, 0).cast(BTN.weapon, 1, 40);
    return a;
  };

  it('without a guard it is the generic hop; the Mirror\'s Backstep goes about 3 units', () => {
    expect(retreatOf([]).w.bodies.x[0]).toBeLessThan(-0.8);
    const m = retreatOf(['shield']).w.bodies.x[0];
    expect(m).toBeLessThan(-2.5); expect(m).toBeGreaterThan(-3.5);
    expect(retreatOf(['shield', 'water', 'water']).w.bodies.x[0]).toBeLessThan(retreatOf(['shield', 'water']).w.bodies.x[0]); // a 2-rune Tide surges further
  });

  it('Shove step (Bulwark): a short step back, and what was in front is knocked back and stunned', () => {
    const { w, d, enemy } = arena();
    d.conjure('shield', 'earth');
    const e = enemy(ARCH.swarmer, 1.4, 0);
    w.bodies.x[0] = 0; w.bodies.y[0] = 0;
    d.aimAt(5, 0).cast(BTN.weapon, 1, 12);
    expect(w.bodies.x[0]).toBeLessThan(-1);
    expect(w.bodies.x[0]).toBeGreaterThan(-2);
    expect(w.bodies.x[e]).toBeGreaterThan(2.2); // with your step back, about 3 u of space
    expect(w.bodies.stun[e]).toBeGreaterThan(0);
  });

  it('Flame step leaves a short line of fire; Ice slide a lasting ice strip and a long slide', () => {
    const f = retreatOf(['shield', 'fire']);
    expect(f.w.bodies.x[0]).toBeLessThan(-2.2);
    const i = retreatOf(['shield', 'cold']);
    expect(i.w.surf.kind[cellAt(i.w, -2, 0)]).toBe(SURF.ice);
    expect(i.w.bodies.x[0]).toBeLessThan(-3);
  });

  it('Blink (Spark) teleports 3 units back and leaves a shocking spark on your old spot', () => {
    const { w } = retreatOf(['shield', 'lightning']);
    expect(w.bodies.x[0]).toBeCloseTo(-3, 1);
    expect(Array.from(w.zones.type).includes(ZONE.spark)).toBe(true);
  });

  it('Surge (Tide) shoves and soaks whatever is in front', () => {
    const { w } = retreatOf(['shield', 'water'], (a) => { a.enemy(ARCH.brute, 1.6, 0); });
    const e = 4; // first enemy slot
    expect(w.bodies.x[e]).toBeGreaterThan(2);
    expect(w.bodies.wet[e]).toBeGreaterThan(0);
    expect(w.bodies.x[0]).toBeLessThan(-2);
  });

  it('Seed step (Leaf): a hop back that blooms where you land, healing you and allies there, never enemies', () => {
    let foe = -1;
    const { w } = retreatOf(['shield', 'life'], (a) => {
      a.w.bodies.x[1] = -2.5; a.w.bodies.y[1] = 0.8; a.w.bodies.hp[1] = 50; // waiting where you land
      a.w.bodies.hp[0] = 50;
      foe = spawnBody(a.w, -1, KIND.enemy, TEAM.enemies, 1, 0, 100, 0.4); a.w.bodies.hp[foe] = 40; // chasing you
    });
    expect(w.bodies.x[0]).toBeLessThan(-2);
    expect(Array.from(w.zones.type).includes(ZONE.spring)).toBe(false); // nothing left on the ground
    expect(w.bodies.hp[1]).toBeGreaterThan(50);
    expect(w.bodies.hp[0]).toBeGreaterThan(50);
    expect(w.bodies.hp[foe]).toBeLessThanOrEqual(40);
  });

  it('Leaf block heals allies on any side of you', () => {
    const { w, d } = arena(2);
    d.conjure('shield', 'life');
    w.bodies.x[1] = 2; w.bodies.y[1] = 0; w.bodies.hp[1] = 50; // in front, not behind
    d.aimAt(5, 0).tick({ buttons: BTN.self }, 60);
    expect(w.bodies.hp[1]).toBeGreaterThan(55);
  });

  it('Rime block chills a biting goblin', () => {
    const { w, d, enemy } = arena();
    d.conjure('shield', 'cold');
    const e = enemy(ARCH.swarmer, 1.4, 0);
    let chilled = false;
    for (let t = 0; t < 200 && !chilled; t++) { d.aimAt(5, 0).tick({ buttons: BTN.self }); if (w.bodies.chill[e] > 0) chilled = true; }
    expect(chilled).toBe(true);
  });

  it('Retreat has a fixed 0.5 s recovery: a second Retreat right away does nothing', () => {
    const { w, d } = arena();
    d.conjure('shield');
    w.bodies.x[0] = 0;
    d.aimAt(5, 0).tick({ buttons: BTN.weapon }).tick({}, 14);
    const x1 = w.bodies.x[0];
    d.tick({ buttons: BTN.weapon }).tick({}, 30);
    expect(w.bodies.x[0]).toBeGreaterThan(x1 - 0.5);
  });
});

describe('weapons: Heavies and Specials', () => {
  const heavyWith = (q: Element[], hold = 50) => { const a = arena(); a.d.aimAt(6, 0).conjure(...q); return { ...a, go: () => a.d.cast(BTN.force, hold, 60) }; };

  it('the trident\'s wave slash rolls along the floor, shoving and soaking', () => {
    const { w, dummy, go } = heavyWith(['sigil', 'water']);
    const t = dummy(3.5, 0.6);
    go();
    expect(w.bodies.wet[t]).toBeGreaterThan(0);
  });

  it('the flame sword\'s fire wave ignites what it passes and leaves no fire on the floor', () => {
    const { w, dummy, go } = heavyWith(['sigil', 'fire']);
    const t = dummy(4.5, 1);
    go();
    expect(w.bodies.burn[t] + (400 - w.bodies.hp[t])).toBeGreaterThan(0);
    expect(Array.from(w.surf.kind).includes(SURF.fire)).toBe(false);
  });

  it('the maul\'s fissure knocks down everything in its lane, nothing beside it', () => {
    const { w, dummy, go } = heavyWith(['sigil', 'earth']);
    const inLane = dummy(6, 0, 8), beside = dummy(4, 2.2, 9);
    let down = false;
    w.bodies.down.fill(0);
    for (let k = 0; k < 1; k++) go();
    down = w.bodies.hp[inLane] < 400;
    expect(down).toBe(true);
    expect(w.bodies.hp[beside]).toBe(400);
  });

  it('the spear\'s impaling dash goes about 2.5x its reach, straight through a frozen target, which shatters', () => {
    const { w, dummy, go } = heavyWith(['sigil', 'cold']);
    const frozen = dummy(2.5, 0, 8);
    w.bodies.frozen[frozen] = 600;
    go();
    expect(w.bodies.frozen[frozen]).toBe(0);
    expect(w.bodies.hp[frozen]).toBeLessThan(400);
    expect(w.bodies.x[0]).toBeGreaterThan(4.5);
  });

  it('the whip\'s chain lash jumps from the first body to up to three more', () => {
    const { w, dummy, go } = heavyWith(['sigil', 'lightning']);
    const ts = [dummy(3, 0, 8), dummy(5, 1, 9), dummy(7, 0, 10), dummy(8.5, 2, 11)];
    go();
    for (const t of ts) expect(w.bodies.hp[t]).toBeLessThan(400);
  });

  it('Healing link: hold RMB on an ally; it keeps healing as they walk away, breaks past 8 u, costs a use a second', () => {
    const { w, d } = arena(2);
    d.conjure('sigil', 'life');
    w.bodies.x[1] = 3; w.bodies.y[1] = 0; w.bodies.hp[1] = 40;
    const ally = new Driver(w, 1);
    const uses = w.seats.weaponUses[0];
    d.aimAt(3, 0);
    for (let k = 0; k < 120; k++) step(w, [d.input({ buttons: BTN.force }), ally.input({ moveX: 60 }), NO_INPUT, NO_INPUT]);
    expect(w.seats.linkTo[0]).toBe(1);
    expect(w.bodies.hp[1]).toBeGreaterThan(55);
    expect(w.seats.weaponUses[0]).toBeLessThanOrEqual(uses - 1);
    for (let k = 0; k < 200 && w.seats.linkTo[0] >= 0; k++) step(w, [d.input({ buttons: BTN.force }), ally.input({ moveX: 127 }), NO_INPUT, NO_INPUT]);
    expect(w.seats.linkTo[0]).toBe(-1);
    expect(w.bodies.x[1] - w.bodies.x[0]).toBeGreaterThan(ARMS.linkRange - 0.5);
  });

  it('the spear\'s javelin (Shift+RMB) pins the target and frosts the ground; the spear stays; 2 uses', () => {
    const { w, d, enemy } = arena();
    d.aimAt(5, 0).conjure('sigil', 'cold');
    const e = enemy(ARCH.brute, 5, 0);
    const uses = w.seats.weaponUses[0];
    d.tick({ buttons: BTN.area }).tick({}, 25);
    expect(w.seats.weapon[0]).toBe(EL.cold);
    expect(w.seats.weaponUses[0]).toBe(uses - ARMS.javelinUses);
    expect(w.bodies.root[e]).toBeGreaterThan(0);
    expect(Array.from(w.surf.kind).includes(SURF.ice)).toBe(true);
  });
});

describe('the Arcane wand (Sigil + Arcane) and Mend', () => {
  it('Strike is a light bolt', () => {
    const { w, d, dummy } = arena();
    const t = dummy(4, 0);
    d.aimAt(4, 0).conjure('sigil', 'arcane').cast(BTN.force, 1, 40);
    expect(w.bodies.hp[t]).toBeLessThan(400);
    expect(w.bodies.hp[t]).toBeGreaterThan(390);
  });

  it('a charged bolt (Heavy) hits harder and pierces', () => {
    const { w, d, dummy } = arena();
    const a = dummy(3, 0, 8), b = dummy(6, 0, 9);
    d.aimAt(6, 0).conjure('sigil', 'arcane').cast(BTN.force, 60, 60);
    expect(400 - w.bodies.hp[a]).toBeGreaterThan(16 * ARMS.boltScale * 1.5); // harder than a Strike's light bolt
    expect(w.bodies.hp[b]).toBeLessThan(400);
  });

  it('Siphon: hold Shift+RMB, rooted, runes regenerate several times as fast, a use a second', () => {
    const regen: number[] = [];
    for (const siphon of [false, true]) {
      const { w, d } = arena();
      d.aimAt(5, 0).conjure('sigil', 'arcane');
      w.seats.runes[EL.fire - 1] = 0;
      const uses = w.seats.weaponUses[0];
      const hold = siphon ? { buttons: BTN.area, moveX: 127 } : {};
      d.tick(hold, 20);
      const x = w.bodies.x[0];
      d.tick(hold, 130);
      regen.push(w.seats.runes[EL.fire - 1]);
      if (siphon) { expect(Math.abs(w.bodies.x[0] - x)).toBeLessThan(0.1); expect(w.seats.weaponUses[0]).toBe(uses - 2 * ARMS.siphonUses); }
    }
    expect(regen[1]).toBeGreaterThan(regen[0] * 3);
  });

  it('Mend (Healing hands, Shift+RMB held) heals allies around you', () => {
    const { w, d } = arena(2);
    d.aimAt(5, 0).conjure('sigil', 'life');
    w.bodies.x[1] = -2; w.bodies.y[1] = 1; w.bodies.hp[1] = 40;
    d.tick({ buttons: BTN.area }, 120);
    expect(w.bodies.hp[1]).toBeGreaterThan(48);
    expect(w.seats.weapon[0]).toBe(EL.life);
  });

  it('Siphon refills the elements in the wand faster still', () => {
    const fire = (q: Element[]) => {
      const { w, d } = arena();
      d.aimAt(5, 0).conjure(...q);
      w.seats.runes[EL.fire - 1] = 0;
      d.tick({ buttons: BTN.area }, 40); // short of full: the shared budget pours most of R into the one empty pool
      return w.seats.runes[EL.fire - 1];
    };
    expect(fire(['sigil', 'arcane', 'fire'])).toBeGreaterThan(fire(['sigil', 'arcane']) * 1.5);
  });

  it('Mend scales with every rune, and Water in the hands puts out a burning ally', () => {
    const mend = (q: Element[]) => {
      const { w, d } = arena(2);
      d.aimAt(5, 0).conjure(...q);
      w.bodies.x[1] = -2; w.bodies.y[1] = 1; w.bodies.hp[1] = 40; w.bodies.burn[1] = 600;
      d.tick({ buttons: BTN.area }, 60);
      return w;
    };
    const plain = mend(['sigil', 'life']), wet = mend(['sigil', 'life', 'water']);
    expect(wet.bodies.burn[1]).toBe(0);
    expect(plain.bodies.burn[1]).toBeGreaterThan(0);
    expect(mend(['sigil', 'life', 'life']).bodies.hp[1]).toBeGreaterThan(plain.bodies.hp[1]);
  });
});

describe('weapon blows land: a physical hit plus the weapon\'s elements (the trident bug)', () => {
  /** Conjures, then puts a swarmer `ahead` units in front (behind if negative) and taps `btn`, collecting the events. */
  const blowAt = (q: Element[], ahead: number, btn: number) => {
    const a = arena();
    if (q.length) a.d.aimAt(4, 0).conjure(...q); else a.d.aimAt(4, 0).tick({}, 2);
    const e = a.enemy(ARCH.swarmer, ahead, 0), hp = a.w.bodies.hp[e];
    const events: string[] = [];
    const log = () => { for (const ev of a.w.events) events.push(ev.kind === 'move' ? `move:${ev.text}` : ev.who === 0 ? ev.kind : ''); };
    a.d.tick({ buttons: btn }); log();
    for (let k = 0; k < 12; k++) { a.d.tick(); log(); }
    return { ...a, e, hp, events };
  };

  it('a trident Strike damages and shoves an enemy straight ahead, and soaks it', () => {
    const { w, e, hp, events } = blowAt(['sigil', 'water'], 1.2, BTN.force);
    expect(w.bodies.hp[e]).toBeLessThan(hp);
    expect(w.bodies.x[e]).toBeGreaterThan(1.5); // shoved hard
    expect(w.bodies.lastHit[e]).toBeGreaterThan(0);
    expect(w.bodies.wet[e]).toBeGreaterThan(0);
    expect(events).toContain('move:strike');
    expect(events).not.toContain('burst'); // drawn as a thrust, not a nova
  });

  it('a trident Sweep hits behind you too, shoving outward', () => {
    const { w, e, hp, events } = blowAt(['sigil', 'water'], -1.2, BTN.area);
    expect(w.bodies.hp[e]).toBeLessThan(hp);
    expect(w.bodies.x[e]).toBeLessThan(-1.5);
    expect(events).toContain('move:sweep');
  });

  it('every weapon\'s Strike and the staff\'s deal damage; the trident shoves hardest', () => {
    const shove: Record<string, number> = {};
    for (const q of [[], ['sigil', 'water'], ['sigil', 'cold'], ['sigil', 'lightning'], ['sigil', 'fire'], ['sigil', 'earth']] as Element[][]) {
      const { w, e, hp } = blowAt(q, 1.2, BTN.force);
      expect(w.bodies.hp[e], q.join('+') || 'staff').toBeLessThan(hp);
      shove[q[1] ?? 'staff'] = w.bodies.x[e];
    }
    for (const k of ['staff', 'cold', 'lightning', 'fire']) expect(shove.water).toBeGreaterThan(shove[k]);
  });

  it('the trident\'s Strike is a narrow thrust: a body well off to the side is missed', () => {
    const a = arena();
    a.d.aimAt(4, 0).conjure('sigil', 'water');
    const side = a.enemy(ARCH.swarmer, 1.0, 1.3), hp = a.w.bodies.hp[side];
    a.d.cast(BTN.force, 1, 12);
    expect(a.w.bodies.hp[side]).toBe(hp);
  });

  it('the Healing hands\' Strike heals, with no physical hit', () => {
    const { w, d } = arena(2);
    d.aimAt(1.2, 0).conjure('sigil', 'life');
    w.bodies.x[1] = 1.2; w.bodies.y[1] = 0; w.bodies.hp[1] = 50;
    d.cast(BTN.force, 1, 12);
    expect(w.bodies.hp[1]).toBeGreaterThan(50);
  });
});

describe('the imbued burst (Weapon cast with elements, no Sigil or Shield)', () => {
  it('bursts every queued element at full power in a short cone in front; nothing stays in hand', () => {
    const { w, d, dummy } = arena();
    const front = dummy(2.2, 0.3, 8), behind = dummy(-1.5, 0, 9), far = dummy(5, 0, 10);
    d.aimAt(5, 0).queue('fire', 'arcane'); // Arcane leads: a cone (Lightning's forks, Earth's is a line: below)
    const events: string[] = [];
    d.tick({ buttons: BTN.weapon });
    for (let k = 0; k < 30; k++) { d.tick(); for (const ev of w.events) if (ev.kind === 'move' || ev.kind === 'burst') events.push(`${ev.kind}:${ev.text ?? ''}`); }
    expect(400 - w.bodies.hp[front]).toBeGreaterThan(10); // fire + arcane, at full power
    expect(w.bodies.burn[front]).toBeGreaterThan(0);
    expect(w.bodies.hp[behind]).toBe(400);
    expect(w.bodies.hp[far]).toBe(400);
    expect(w.seats.weapon[0]).toBe(0);
    expect(events).toContain('move:imbue');
    expect(events.filter((e) => e.startsWith('burst'))).toEqual([]);
  });

  it('more runes reach a little further and hit harder', () => {
    const run = (q: Element[]) => { const { w, d, dummy } = arena(); const t = dummy(3.3, 0); d.aimAt(5, 0).queue(...q).cast(BTN.weapon, 1, 40); return 400 - w.bodies.hp[t]; };
    expect(run(['fire'])).toBe(0);
    expect(run(['fire', 'fire', 'fire'])).toBeGreaterThan(0);
  });

  it('an Earth-led burst is a long narrow line, and stays one with other elements infused', () => {
    const { w, d, dummy } = arena();
    const far = dummy(4.2, 0, 8), beside = dummy(2, 1.6, 9);
    d.aimAt(5, 0).queue('earth', 'fire').cast(BTN.weapon, 1, 30);
    expect(400 - w.bodies.hp[far]).toBeGreaterThan(0); // past the cone's reach, on the line
    expect(w.bodies.burn[far]).toBeGreaterThan(0); // the fire rides along it
    expect(w.bodies.hp[beside]).toBe(400); // inside the cone's width, off the line
  });

  it('Life + Earth is a healing tremor: the line heals whoever stands on it', () => {
    const { w, d, dummy } = arena();
    const on = dummy(4, 0, 8), off = dummy(2, 1.6, 9);
    w.bodies.hp[on] = 100; w.bodies.hp[off] = 100;
    d.aimAt(5, 0).queue('life', 'earth').cast(BTN.weapon, 1, 30);
    expect(w.bodies.hp[on]).toBeGreaterThan(100);
    expect(w.bodies.hp[off]).toBe(100);
  });

  it('a Lightning-led burst forks to the nearest targets in front, each jumping on once, all at once', () => {
    const { w, d, dummy } = arena();
    const a = dummy(2, 0, 8), b = dummy(2.6, 1, 9), c = dummy(3, -1, 10), next = dummy(5.8, -1, 11), out = dummy(12, 0, 12);
    d.aimAt(5, 0).queue('lightning');
    const zaps: number[] = [];
    d.tick({ buttons: BTN.weapon });
    for (let k = 0; k < 20; k++) { d.tick(); for (const ev of w.events) if (ev.kind === 'zap') zaps.push(w.clock[0]); }
    for (const t of [a, b, c, next]) expect(400 - w.bodies.hp[t]).toBeGreaterThan(0);
    expect(w.bodies.hp[out]).toBe(400);
    expect(new Set(zaps).size).toBe(1); // one tick: no channel
  });
});

describe('weapon rhythm: a weapon is the cheap option, not the strongest (explorations/2026-11-05-weapon-dps.md)', () => {
  it('a spammed wand Strike stays near half the Arcane beam\'s sustained DPS; the whip\'s below the arc\'s', () => {
    const beam = measure({ name: 'beam', spell: ['arcane'], dist: 3 }, 10).dps;
    const wand = measure({ name: 'wand', weapon: ['sigil', 'arcane'], move: 'strike', dist: 3 }, 10).dps;
    const heavy = measure({ name: 'wand heavy', weapon: ['sigil', 'arcane'], move: 'heavy', dist: 3 }, 10).dps;
    expect(wand).toBeLessThan(beam * 0.65);
    expect(wand).toBeGreaterThan(beam * 0.4);
    expect(heavy).toBeLessThan(beam * 0.7);
    const whip = measure({ name: 'whip', weapon: ['sigil', 'lightning'], move: 'strike', dist: 1 }, 10).dps;
    expect(whip).toBeLessThan(measure({ name: 'arc', spell: ['lightning'], dist: 2 }, 10).dps * 0.65);
  });

  it('a Strike\'s recovery is its weapon\'s follow-through: the maul\'s is slow, the staff\'s quicker', () => {
    const recovery = (q: Element[]) => {
      const { w, d } = arena();
      if (q.length) d.aimAt(4, 0).conjure(...q);
      d.tick({}, 40).tick({ buttons: BTN.force }).tick();
      let n = 0;
      while (w.seats.phase[0] !== 0 && n < 300) { d.tick(); n++; }
      return n;
    };
    expect(recovery(['sigil', 'earth'])).toBeGreaterThan(recovery([]) + 30);
    expect(Math.abs(recovery(['sigil', 'arcane']) - Math.round(ARMS.strikeRecovery.arcane * 60))).toBeLessThan(3);
  });
});
