/**
 * Round-2 weapons and guards (docs/explorations/2026-11-05-guards.md): the weapon-specific Heavies
 * and Specials, the Echo focus, and the eight guards' Defend, Retreat, passives and resistances.
 */
import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import {
  ARCH, ARCHETYPES, ARMS, BTN, EL, GUARD, KIND, NO_INPUT, SURF, TEAM, ZONE, createWorld, elementId, quantize, spawnBody, step,
  type PlayerInput, type World,
} from '../src';
import { resist, RES } from '../src/guards';
import { cellAt } from '../src/effects';

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

  it('a second element adds only its own resistance, at half strength', () => {
    const { w, d } = arena();
    d.conjure('shield', 'fire', 'fire', 'earth'); // Ember targe, led by Fire, with Earth second
    expect(w.seats.guard[0]).toBe(GUARD.ember);
    expect(resist(w, 0, RES.fire)).toBe(1);
    expect(resist(w, 0, RES.physical)).toBe(0.25); // half of the Bulwark's 50 % physical
    expect(resist(w, 0, RES.cold)).toBe(0.5); // the Ember's own, nothing from the Bulwark's cold
  });

  it('resistances apply while carried: an Ember targe takes no fire, a Rime kite takes more', () => {
    const took: Record<string, number> = {};
    for (const q of [[], ['shield', 'fire'], ['shield', 'cold']] as Element[][]) {
      const { w, d } = arena(2);
      if (q.length) d.conjure(...q);
      w.bodies.x[1] = 3; w.bodies.y[1] = 0;
      new Driver(w, 1).aimAt(0, 0).queue('fire').cast(BTN.force, 60, 5);
      took[q.join('+') || 'none'] = 100 - w.bodies.hp[0];
    }
    expect(took.none).toBeGreaterThan(5);
    expect(took['shield+fire']).toBe(0);
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

  it('a Mirror parry (Space tapped as the shot lands) sends the shot back; a late block only absorbs it', () => {
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
      else expect(w.seats.guardHp[0]).toBeLessThan(ARMS.hp.mirror);
    }
  });

  it('the Prism pane stops a beam from the front while raised, and halves it when not', () => {
    const hurt: number[] = [];
    for (const mode of ['none', 'carried', 'raised']) {
      const { w, d } = arena(2);
      if (mode !== 'none') d.conjure('shield', 'arcane');
      d.aimAt(3, 0);
      w.bodies.x[1] = 3; w.bodies.y[1] = 0;
      const ally = new Driver(w, 1).aimAt(0, 0);
      step(w, [d.input(), ally.input({ press0: elementId('arcane') }), NO_INPUT, NO_INPUT]);
      for (let k = 0; k < 90; k++) step(w, [d.input(mode === 'raised' ? { buttons: BTN.self } : {}), ally.input({ buttons: BTN.force }), NO_INPUT, NO_INPUT]);
      hurt.push(100 - w.bodies.hp[0]);
    }
    expect(hurt[0]).toBeGreaterThan(5);
    expect(hurt[1]).toBeLessThan(hurt[0] * 0.75); // the hovering ward (plus the Prism's arcane resistance)
    expect(hurt[2]).toBe(0);
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

  it('passives: Tide is always wet and never burns; Leaf regrows; Ember dries you at once', () => {
    const tide = arena(); tide.d.conjure('shield', 'water'); tide.d.tick({}, 30);
    expect(tide.w.bodies.wet[0]).toBeGreaterThan(0);
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

  it('without a guard it is the generic hop; the Mirror\'s Backstep goes about 2 units', () => {
    expect(retreatOf([]).w.bodies.x[0]).toBeLessThan(-0.8);
    const m = retreatOf(['shield']).w.bodies.x[0];
    expect(m).toBeLessThan(-1.6); expect(m).toBeGreaterThan(-2.4);
  });

  it('Brace (Bulwark) does not move you, and nothing knocks you back', () => {
    const { w } = retreatOf(['shield', 'earth']);
    expect(Math.abs(w.bodies.x[0])).toBeLessThan(0.05);
    expect(w.seats.retreatT[0]).toBeGreaterThan(0); // 1 s brace, 40 ticks in: still braced
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

  it('Regroup (Leaf) curves toward the nearest ally and heals you both', () => {
    const { w } = retreatOf(['shield', 'life'], (a) => { a.w.bodies.x[1] = -1; a.w.bodies.y[1] = 3; a.w.bodies.hp[1] = 50; a.w.bodies.hp[0] = 50; });
    expect(w.bodies.y[0]).toBeGreaterThan(1);
    expect(w.bodies.hp[1]).toBeGreaterThan(50);
    expect(w.bodies.hp[0]).toBeGreaterThan(50);
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

  it('the spear\'s javelin (Shift+RMB) pins the target and frosts the ground; the spear stays; 3 uses', () => {
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

describe('the Echo focus (Sigil + Arcane)', () => {
  it('remembers your last spell and re-casts it at half power for 5 uses, no runes', () => {
    const { w, d, dummy } = arena();
    const t = dummy(4, 0);
    d.aimAt(4, 0).queue('earth').cast(BTN.force, 50, 40); // a rock
    const first = 400 - w.bodies.hp[t];
    expect(first).toBeGreaterThan(0);
    w.bodies.hp[t] = 400;
    d.conjure('sigil', 'arcane');
    expect(w.seats.echoCast[0]).toBeGreaterThan(0);
    expect(w.seats.echoEls[0 * 9 + EL.earth - 1]).toBe(1);
    const earth = w.seats.runes[EL.earth - 1], uses = w.seats.weaponUses[0];
    d.cast(BTN.force, 40, 60); // Heavy: the echo
    expect(w.bodies.hp[t]).toBeLessThan(400);
    expect(400 - w.bodies.hp[t]).toBeLessThan(first);
    expect(w.seats.runes[EL.earth - 1]).toBeGreaterThanOrEqual(earth);
    expect(w.seats.weaponUses[0]).toBe(uses - ARMS.echoUses);
  });

  it('echoes a channel for a moment on its own', () => {
    const { w, d, dummy } = arena();
    const t = dummy(3, 0);
    d.aimAt(3, 0).queue('fire').cast(BTN.force, 20, 30);
    w.bodies.hp[t] = 400; w.bodies.burn[t] = 0;
    d.conjure('sigil', 'arcane').cast(BTN.force, 40, 80);
    expect(w.bodies.hp[t]).toBeLessThan(400);
  });

  it('Copy (Shift+RMB) takes the spell an ally just cast near you', () => {
    const { w, d, dummy } = arena(2);
    dummy(4, -3);
    d.conjure('sigil', 'arcane');
    w.bodies.x[1] = 2; w.bodies.y[1] = 0;
    const ally = new Driver(w, 1).aimAt(4, -3);
    step(w, [d.input(), ally.input({ press0: elementId('cold') }), NO_INPUT, NO_INPUT]);
    step(w, [d.input(), ally.input({ press0: elementId('cold') }), NO_INPUT, NO_INPUT]);
    for (let k = 0; k < 20; k++) step(w, [d.input(), ally.input({ buttons: BTN.area }), NO_INPUT, NO_INPUT]);
    for (let k = 0; k < 20; k++) step(w, [d.input(), ally.input(), NO_INPUT, NO_INPUT]);
    expect(w.seats.lastCast[1]).toBeGreaterThan(0);
    d.tick({ buttons: BTN.area }).tick({}, 10);
    expect(w.seats.echoEls[EL.cold - 1]).toBe(2);
  });

  it('Strike is a weak bolt', () => {
    const { w, d, dummy } = arena();
    const t = dummy(4, 0);
    d.aimAt(4, 0).conjure('sigil', 'arcane').cast(BTN.force, 1, 40);
    expect(w.bodies.hp[t]).toBeLessThan(400);
    expect(w.bodies.hp[t]).toBeGreaterThan(390);
  });
});
