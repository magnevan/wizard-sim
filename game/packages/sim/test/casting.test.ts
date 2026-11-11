import { describe, expect, it } from 'vitest';
import type { Element } from '@wizard-sim/rules';
import {
  BTN, DAMAGE, EL, KIND, N_EL, NO_INPUT, PHASE, RUNES, SHAPES, STATUS, SURF, T, ZONE, compile, createWorld, elementId, fullMask, quantize, regenRate, step,
  type PlayerInput, type World,
} from '../src';
import { cellAt } from '../src/effects';
import { RES, taken } from '../src/guards';

// A tiny driver: seat 0 acts, everyone else idles. Aim is a world point, kept between steps.
class Driver {
  aim = { x: 1, y: 0 };
  constructor(readonly w: World) {}
  tick(over: Partial<PlayerInput> = {}, n = 1): this {
    const b = this.w.bodies;
    for (let k = 0; k < n; k++) {
      const me = quantize({ ...NO_INPUT, aimX: (this.aim.x - b.x[0]) * 32, aimY: (this.aim.y - b.y[0]) * 32, ...over });
      step(this.w, [me, NO_INPUT, NO_INPUT, NO_INPUT]);
    }
    return this;
  }
  aimAt(x: number, y: number): this { this.aim = { x, y }; return this; }
  queue(...els: Element[]): this { for (const e of els) this.tick({ press0: elementId(e) }); return this; }
  /** Press a button, hold it `hold` ticks, release, then let the cast play out. */
  cast(btn: number, hold = 1, after = 40): this { this.tick({ buttons: btn }, hold); return this.tick({}, after); }
  place(x: number, y: number, hold = 30): this { this.aimAt(x, y); return this.cast(BTN.area, hold); }
}

/** A world with one wizard at (0, 0) and a dummy at (dx, 0). */
function range(dx = 3, players = 1): { w: World; d: Driver; dummy: number } {
  const w = createWorld(1, players, { dummies: false });
  const b = w.bodies;
  b.x[0] = 0; b.y[0] = 0;
  const dummy = 4;
  b.kind[dummy] = KIND.dummy; b.team[dummy] = 2; b.x[dummy] = dx; b.y[dummy] = 0; b.r[dummy] = 0.5; b.hp[dummy] = b.maxHp[dummy] = 400;
  const d = new Driver(w).aimAt(dx, 0);
  return { w, d, dummy };
}
const rune = (w: World, el: Element) => w.seats.runes[elementId(el) - 1];

describe('runes and the queue', () => {
  it('queueing reserves a rune, Esc gives it back', () => {
    const { w, d } = range();
    d.queue('fire');
    expect(rune(w, 'fire')).toBeCloseTo(RUNES.max.fire - 1, 1);
    d.tick({ buttons: BTN.clear });
    expect(w.seats.queueLen[0]).toBe(0);
    expect(rune(w, 'fire')).toBeCloseTo(RUNES.max.fire, 1);
  });

  it('a cancel refunds the cancelled rune and never spends the new one', () => {
    const { w, d } = range();
    d.queue('fire', 'cold');
    expect(w.seats.queueLen[0]).toBe(0);
    expect(rune(w, 'fire')).toBeCloseTo(RUNES.max.fire, 1);
    expect(rune(w, 'cold')).toBeCloseTo(RUNES.max.cold, 1);
  });

  it('you cannot queue an element you are out of', () => {
    const { w, d } = range();
    w.seats.runes[elementId('earth') - 1] = 0.5;
    d.queue('earth');
    expect(w.seats.queueLen[0]).toBe(0);
    expect(w.events.some((e) => e.kind === 'dry')).toBe(true);
  });

  it('a cast spends the runes; regen brings them back slowly, faster when attuned', () => {
    const { w, d } = range();
    d.queue('arcane').cast(BTN.self, 1, 20); // Attune (it lands after the wind-up)
    w.seats.runes[elementId('arcane') - 1] = 0;
    const rate = regenRate(w, 0, elementId('arcane'), fullMask(w, 0));
    d.tick({}, 30);
    expect(rune(w, 'arcane')).toBeCloseTo((rate * RUNES.attuneMult) / 2, 6);
  });

  it('regen is one shared budget R, weighted by max, with a floor for every pool that is not full', () => {
    const { w, d } = range();
    const max = RUNES.max as Record<string, number>, all = Object.values(max).reduce((a, b) => a + b, 0);
    // only Fire is empty: it gets the floor's share plus all of the shared part
    w.seats.runes[elementId('fire') - 1] = 0;
    d.tick({}, 30);
    expect(rune(w, 'fire')).toBeCloseTo(0.5 * RUNES.regen * max.fire * (RUNES.floor / all + (1 - RUNES.floor) / max.fire), 6);
    // every pool empty: the whole of R is shared out by max, so the total is R
    for (let e = 0; e < 9; e++) w.seats.runes[e] = 0;
    d.tick({}, 30);
    let total = 0;
    for (let e = 0; e < 9; e++) total += w.seats.runes[e];
    expect(total).toBeCloseTo(0.5 * RUNES.regen, 6);
    expect(rune(w, 'fire') / rune(w, 'cold')).toBeCloseTo(max.fire / max.cold, 6);
  });
});

describe('Force casts', () => {
  it('a flamethrower burns the dummy', () => {
    const { w, d, dummy } = range();
    d.queue('fire').cast(BTN.force, 60);
    expect(w.bodies.hp[dummy]).toBeLessThan(400);
    expect(w.bodies.burn[dummy]).toBeGreaterThan(0);
  });

  it('wet targets take double from lightning', () => {
    const a = range(), b = range();
    a.w.bodies.wet[a.dummy] = 600;
    for (const { d } of [a, b]) d.queue('lightning').cast(BTN.force, 30);
    const lostWet = 400 - a.w.bodies.hp[a.dummy], lostDry = 400 - b.w.bodies.hp[b.dummy];
    expect(lostWet).toBeGreaterThan(lostDry * 1.8);
  });

  it('Cold alone never freezes, however much of it', () => {
    const { w, d, dummy } = range();
    w.bodies.maxHp[dummy] = 30; w.bodies.hp[dummy] = 30;
    d.queue('cold', 'cold', 'cold').cast(BTN.force, 200, 0);
    expect(w.bodies.chill[dummy]).toBeGreaterThan(0.9);
    expect(w.bodies.frozen[dummy]).toBe(0);
  });

  it('chill fills on damage: a big body fills more slowly but can fill, and a weak source can stall', () => {
    const fill = (maxHp: number, runes: Element[], ticks: number) => {
      const { w, d, dummy } = range();
      w.bodies.maxHp[dummy] = maxHp; w.bodies.hp[dummy] = maxHp;
      d.queue(...runes).cast(BTN.force, ticks, 0);
      return w.bodies.chill[dummy];
    };
    const one: Element[] = ['cold'], three: Element[] = ['cold', 'cold', 'cold'];
    expect(fill(345, three, 60)).toBeLessThan(fill(30, three, 60));
    expect(fill(345, one, 280)).toBeLessThan(STATUS.freezeMin); // a one-rune spray barely outruns a Brute's decay
    expect(fill(345, three, 280)).toBeGreaterThan(STATUS.freezeMin);
    expect(fill(4000, three, 280)).toBe(0); // one spray can't outrun the decay of something this big: it takes rings or a second caster
  });

  it('chill counts Cold\'s share of a mixed spell: more Cold chills more, and a freeze uses it up', () => {
    const mix = (q: Element[]) => { const { w, d, dummy } = range(2); d.queue(...q).cast(BTN.area, 1, 25); return w.bodies.chill[dummy]; };
    expect(mix(['arcane', 'cold', 'cold'])).toBeGreaterThan(mix(['arcane', 'arcane', 'cold']) * 1.5);
    const { w, d, dummy } = range(2);
    w.bodies.maxHp[dummy] = 30; w.bodies.wet[dummy] = 600;
    d.queue('cold').cast(BTN.area, 1, 15);
    expect(w.bodies.frozen[dummy]).toBeGreaterThan(0);
    expect(w.bodies.chill[dummy]).toBe(0);
  });

  it('a freeze lasts longer the colder the body was, and too little chill does not freeze', () => {
    const freeze = (chill: number) => {
      const { w, d, dummy } = range(2);
      w.bodies.wet[dummy] = 600; w.bodies.chill[dummy] = chill;
      d.queue('cold').cast(BTN.area, 1, 20);
      return w.bodies.frozen[dummy];
    };
    expect(freeze(0)).toBe(0);
    expect(freeze(0.9)).toBeGreaterThan(freeze(0.35));
  });

  it('burn is a pool: lit by any touch, grown by Fire\'s own damage and a little of the rest', () => {
    const pool = (q: Element[]) => {
      const { w, d, dummy } = range(2);
      d.queue(...q).tick({ buttons: BTN.area }, 1);
      let peak = 0;
      for (let k = 0; k < 40; k++) { d.tick({}, 1); peak = Math.max(peak, w.bodies.burnPool[dummy]); }
      return peak;
    };
    expect(pool(['fire'])).toBeCloseTo(STATUS.burnBase + DAMAGE.fire * SHAPES.fireBlast, 0);
    expect(pool(['fire', 'fire', 'fire'])).toBeGreaterThan(pool(['fire']) * 1.5);
    expect(pool(['arcane', 'arcane', 'fire'])).toBeLessThan(pool(['fire', 'fire', 'fire']));
    const { w, d, dummy } = range(2);
    const hp = w.bodies.hp[dummy];
    d.queue('fire').cast(BTN.area, 1, 300);
    expect(hp - w.bodies.hp[dummy]).toBeCloseTo(DAMAGE.fire * SHAPES.fireBlast + pool(['fire']), 0); // the hit, then all of the pool
    expect(w.bodies.burn[dummy]).toBe(0);
  });

  it('a Water spray soaks long enough to follow with Cold', () => {
    const { w, d, dummy } = range();
    d.queue('water').cast(BTN.force, 60, 2);
    expect(w.bodies.wet[dummy]).toBeGreaterThan(T(STATUS.wetMin) - 10);
  });

  it('Water finishes a freeze on a body already cold enough, and not on one that is not', () => {
    const water = (chill: number) => {
      const { w, d, dummy } = range(2);
      w.bodies.chill[dummy] = chill;
      d.queue('water').cast(BTN.area, 1, 20);
      return w.bodies;
    };
    const dummy = 4;
    const cold = water(0.6);
    expect(cold.frozen[dummy]).toBeGreaterThan(0);
    expect(cold.chill[dummy]).toBe(0);
    expect(cold.wet[dummy]).toBe(0);
    const cool = water(0.15);
    expect(cool.frozen[dummy]).toBe(0);
    expect(cool.wet[dummy]).toBeGreaterThan(0);
  });

  it('a frost spray freezes the wet, and a rock shatters the frozen for double', () => {
    const { w, d, dummy } = range();
    w.bodies.maxHp[dummy] = 30; w.bodies.wet[dummy] = 600;
    d.queue('cold', 'cold').cast(BTN.force, 70, 0);
    expect(w.bodies.frozen[dummy]).toBeGreaterThan(0);
    const before = w.bodies.hp[dummy];
    w.bodies.frozen[dummy] = 200; // keep it frozen however long the spray took
    d.queue('earth').cast(BTN.force, 90, 20);
    expect(before - w.bodies.hp[dummy]).toBeGreaterThan(16 * 0.7 * 2 - 1);
  });

  it('cold freezes the wet: a plain frost ring on a soaked target', () => {
    const { w, d, dummy } = range(2);
    w.bodies.maxHp[dummy] = 30; w.bodies.wet[dummy] = 600;
    d.queue('cold').cast(BTN.area, 1, 30);
    expect(w.bodies.frozen[dummy]).toBeGreaterThan(0);
    expect(w.bodies.wet[dummy]).toBe(0);
  });

  it('water + cold is ice: it neither soaks nor freezes a dry target, but freezes one already wet', () => {
    const dry = range(2);
    dry.d.queue('water', 'cold').cast(BTN.area, 1, 30);
    expect(dry.w.bodies.chill[dry.dummy]).toBeGreaterThan(0);
    expect(dry.w.bodies.wet[dry.dummy]).toBe(0);
    expect(dry.w.bodies.frozen[dry.dummy]).toBe(0);
    const wet = range(2);
    wet.w.bodies.maxHp[wet.dummy] = 30; wet.w.bodies.wet[wet.dummy] = 600;
    wet.d.queue('water', 'cold').cast(BTN.area, 1, 30);
    expect(wet.w.bodies.frozen[wet.dummy]).toBeGreaterThan(0);
  });

  it('water + cold as Force is Ice shards: a volley of missiles, not a spray', () => {
    const spec = compile(['water', 'cold'], 'force');
    expect(spec.title).toBe('Ice shards');
    expect(spec.shape).toBe('shards');
    const { w, d } = range();
    d.queue('water', 'cold').tick({ buttons: BTN.force }, 1).tick({}, 16);
    let n = 0;
    for (let j = 0; j < w.missiles.alive.length; j++) n += w.missiles.alive[j];
    expect(n).toBeGreaterThanOrEqual(5);
  });

  it('the arcane beam hits the first body only, ally or not (friendly fire)', () => {
    const { w, d, dummy } = range(6, 2);
    w.bodies.x[1] = 3; w.bodies.y[1] = 0; // the ally stands in the way
    d.queue('arcane').cast(BTN.force, 60);
    expect(w.bodies.hp[1]).toBeLessThan(100);
    expect(w.bodies.hp[dummy]).toBe(400);
  });

  it('a fully charged rock pierces', () => {
    const { w, d, dummy } = range(3);
    const b = w.bodies;
    b.kind[5] = KIND.dummy; b.team[5] = 2; b.x[5] = 6; b.y[5] = 0; b.r[5] = 0.5; b.hp[5] = b.maxHp[5] = 400;
    d.queue('earth').cast(BTN.force, 75, 60);
    expect(b.hp[dummy]).toBeLessThan(400);
    expect(b.hp[5]).toBeLessThan(400);
  });

  it('the look rule: arcane + fire is a fire beam that burns', () => {
    const spec = compile(['arcane', 'fire'], 'force');
    expect(spec.title).toBe('Fire beam');
    expect(spec.look).toBe(EL.fire);
    const { w, d, dummy } = range();
    d.queue('arcane', 'fire').cast(BTN.force, 40);
    expect(w.bodies.burn[dummy]).toBeGreaterThan(0);
  });

  it('channels cost upkeep past their natural duration', () => {
    const { w, d } = range();
    d.queue('arcane');
    const start = rune(w, 'arcane');
    d.tick({ buttons: BTN.force }, 60 * 8);
    expect(w.seats.phase[0]).toBe(PHASE.channel);
    // 8 s of regen, minus 3 s of upkeep past the 5 s natural duration.
    expect(rune(w, 'arcane')).toBeLessThan(start + 8 * RUNES.regen - 0.5);
  });

  it('Blink is instant and moves you along your aim', () => {
    const { w, d } = range();
    d.aimAt(10, 0).queue('sigil').tick({ buttons: BTN.force });
    expect(w.bodies.x[0]).toBeGreaterThan(3.5);
  });
});

describe('Life (support)', () => {
  it('the Life beam heals an ally and harms no one', () => {
    const { w, d, dummy } = range(6, 2);
    w.bodies.x[1] = 3; w.bodies.y[1] = 0; w.bodies.hp[1] = 40;
    d.queue('life').cast(BTN.force, 60);
    expect(w.bodies.hp[1]).toBeGreaterThan(40);
    expect(w.bodies.hp[dummy]).toBe(400);
  });

  it('the Healing ring heals everyone around, enemies too', () => {
    const { w, d, dummy } = range(2);
    w.bodies.hp[dummy] = 100; w.bodies.hp[0] = 50;
    d.queue('life').cast(BTN.area, 2);
    expect(w.bodies.hp[dummy]).toBeGreaterThan(100);
    expect(w.bodies.hp[0]).toBeGreaterThan(50);
  });

  it('every other element in a heal lends its resistance for a few seconds: Life + Lightning + Cold', () => {
    const { w, d, dummy } = range(2);
    w.bodies.hp[dummy] = 100;
    d.queue('life', 'lightning', 'cold').cast(BTN.area, 2);
    expect(w.bodies.hp[dummy]).toBeGreaterThan(100);
    expect(w.bodies.blessT[dummy]).toBeGreaterThan(0);
    expect(taken(w, dummy, RES.cold)).toBeLessThan(1); // the Cold, not leading the shape, still counts
    expect(taken(w, dummy, RES.lightning)).toBeLessThan(1);
    expect(taken(w, dummy, RES.fire)).toBe(1); // strengths only: no Rime weakness to fire
    d.tick({}, 300);
    expect(taken(w, dummy, RES.cold)).toBe(1); // it lapses
  });

  it('a Life spray: more Fire widens the cone, more Life heals harder', () => {
    const healAt = (q: Element[], x: number, y: number) => {
      const { w, d } = range(8, 2);
      w.bodies.x[1] = x; w.bodies.y[1] = y; w.bodies.hp[1] = 20;
      d.queue(...q).cast(BTN.force, 45, 5);
      return w.bodies.hp[1] - 20;
    };
    // an ally about 43 degrees off your aim: outside a one-Fire cone, inside a three-Fire one
    expect(healAt(['life', 'fire'], 2.19, 2.05)).toBe(0);
    expect(healAt(['life', 'fire', 'fire', 'fire'], 2.19, 2.05)).toBeGreaterThan(0);
    expect(healAt(['life', 'life', 'fire'], 2.5, 0)).toBeGreaterThan(healAt(['life', 'fire'], 2.5, 0));
  });

  it('heal + element: more Cold lends more healing shards, more Lightning more chain-heal jumps', () => {
    expect(compile(['life', 'cold', 'cold'], 'force').sizeN).toBe(2);
    expect(compile(['life', 'cold'], 'force').sizeN).toBe(1);
    const shards = (q: Element[]) => { const { w, d } = range(8, 2); d.queue(...q).cast(BTN.force, 1, 20); return Array.from(w.missiles.alive).filter((a) => a).length; };
    expect(shards(['life', 'cold', 'cold'])).toBeGreaterThan(shards(['life', 'cold']));
  });

  it('heal + element: more Earth gives the lobbed heal-stone a bigger splash', () => {
    const healAt = (q: Element[]) => {
      const { w, d } = range(8, 2);
      w.bodies.x[1] = 4.0; w.bodies.y[1] = 2.75; w.bodies.hp[1] = 20; // off to the side of where the stone lands
      d.aimAt(4, 0).queue(...q).cast(BTN.force, 1, 90);
      return w.bodies.hp[1] - 20;
    };
    expect(healAt(['life', 'earth'])).toBe(0);
    expect(healAt(['life', 'earth', 'earth', 'earth'])).toBeGreaterThan(0);
  });

  it('life + lightning is Chain heal, which seeks hurt allies', () => {
    const spec = compile(['life', 'lightning'], 'force');
    expect(spec.title).toBe('Chain heal');
    expect(spec.shape).toBe('arc');
  });
});

describe('Area and Place', () => {
  it('an Area cast leaves no floor, so it neither soaks nor burns its caster', () => {
    for (const el of ['water', 'fire', 'cold'] as const) {
      const { w, d } = range(4);
      d.queue(el, el).cast(BTN.area, 1, 60);
      expect(Array.from(w.surf.kind).every((k) => k === 0)).toBe(true);
      expect(w.bodies.wet[0]).toBe(0);
      expect(w.bodies.burn[0]).toBe(0);
    }
  });

  it('Fire and Cold rings hit up front, more runes pay, Cold stays under Fire, and the burst follows the ring', () => {
    const first = (q: Element[], btn: number) => {
      const { w, d, dummy } = range(1.6);
      const hp = w.bodies.hp[dummy];
      d.queue(...q).cast(btn, 1, 20); // before much of the burn has ticked
      return hp - w.bodies.hp[dummy];
    };
    expect(first(['fire'], BTN.area)).toBeGreaterThan(DAMAGE.fire * SHAPES.fireBlast * 0.9);
    expect(first(['fire', 'fire', 'fire'], BTN.area)).toBeGreaterThan(first(['fire'], BTN.area) * 1.8);
    expect(first(['cold'], BTN.area)).toBeCloseTo(DAMAGE.cold * SHAPES.coldBlast, 3);
    expect(first(['cold', 'cold', 'cold'], BTN.area)).toBeCloseTo(DAMAGE.cold * SHAPES.coldBlast * 2.4, 3);
    expect(first(['cold', 'cold', 'cold'], BTN.area)).toBeLessThan(first(['fire', 'fire', 'fire'], BTN.area));
    expect(first(['arcane'], BTN.weapon)).toBeCloseTo(first(['arcane'], BTN.area) * SHAPES.imbuePower, 3);
  });

  it('a flood leaves water on the floor, and a lightning strike on it surges', () => {
    const { w, d, dummy } = range(4);
    d.queue('water').place(4, 0);
    expect(w.surf.kind[cellAt(w, 4, 0)]).toBe(SURF.water);
    const before = w.bodies.hp[dummy];
    d.queue('lightning').place(4, 0);
    expect(w.bodies.hp[dummy]).toBeLessThan(before);
  });

  it('Water Place rains for about 5 s (+1 s a rune), soaking whoever stands under it', () => {
    const rainOf = (w: World) => { for (let k = 0; k < w.zones.type.length; k++) if (w.zones.type[k] === ZONE.rain) return k; return -1; };
    const one = range(8);
    one.d.queue('water').place(4, 0, 30); // released at tick 30, then 40 ticks of play-out
    const k = rainOf(one.w);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(one.w.zones.life[k]).toBeGreaterThan(T(SHAPES.rainLife) - 70);
    expect(one.w.zones.life[k]).toBeLessThanOrEqual(T(SHAPES.rainLife));
    expect(one.w.zones.r[k]).toBeCloseTo(SHAPES.patchRadius);
    one.d.tick({}, T(SHAPES.rainLife));
    expect(rainOf(one.w)).toBe(-1); // and then it stops
    const two = range(8);
    two.d.queue('water', 'water').place(4, 0, 30);
    expect(two.w.zones.life[rainOf(two.w)]).toBeGreaterThan(T(SHAPES.rainLife + SHAPES.rainPerRune) - 70);
    // and wider: the user wanted both. The same +0.4 u a rune as every Place patch.
    expect(two.w.zones.r[rainOf(two.w)]).toBeCloseTo(SHAPES.patchRadius + 0.4);
  });

  it('rain keeps dousing: a burning body walking in at 3 s is put out, then soaked', () => {
    const { w, d, dummy } = range(8);
    const b = w.bodies;
    d.queue('water').place(4, 0, 30); // the dummy at (8, 0) is outside the rain at (4, 0)
    expect(b.wet[dummy]).toBe(0);
    d.tick({}, T(3) - 70); // 3 s after the cast
    b.burn[dummy] = T(STATUS.burn); b.x[dummy] = 4; b.y[dummy] = 0.5;
    d.tick({}, 1);
    expect(b.burn[dummy]).toBe(0);
    // the water that puts a fire out doesn't soak you; the rain keeps falling, so it soaks you after
    // for the full wet time (a puddle alone only keeps you wet for a second)
    expect(b.wet[dummy]).toBeLessThan(T(STATUS.wet) - 5);
    d.tick({}, T(1));
    expect(b.wet[dummy]).toBeGreaterThan(T(STATUS.wet) - 5); // still raining on it
    expect(w.surf.kind[cellAt(w, 4, 0)]).toBe(SURF.water);
  });

  it('cold on water makes walkable ice; fire on ice melts it', () => {
    const { w, d } = range(8);
    d.queue('water').place(3, 3).queue('cold').place(3, 3);
    expect(w.surf.kind[cellAt(w, 3, 3)]).toBe(SURF.ice);
    d.queue('fire').place(3, 3);
    expect(w.surf.kind[cellAt(w, 3, 3)]).toBe(SURF.water);
  });

  it('Cold Place is a freezing fog that chills without laying ice; an ice sheet chills and nobody slides on it', () => {
    const { w, d } = range(8, 2);
    const b = w.bodies;
    b.x[1] = 3; b.y[1] = 3;
    d.queue('cold').place(3, 3);
    d.tick({}, 60);
    expect(w.surf.kind[cellAt(w, 3, 3)]).toBe(SURF.none);
    expect(b.chill[1]).toBeGreaterThan(0);
    // Water + Cold lays ice; standing on it chills, and a shove dies away as on any floor
    const ice = range(8, 2);
    ice.w.bodies.x[1] = 3; ice.w.bodies.y[1] = 3;
    ice.d.queue('water').queue('cold').place(3, 3);
    expect(ice.w.surf.kind[cellAt(ice.w, 3, 3)]).toBe(SURF.ice);
    ice.w.bodies.chill[1] = 0; ice.w.bodies.kx[1] = 5;
    ice.d.tick({}, 30);
    expect(ice.w.bodies.chill[1]).toBeGreaterThan(0);
    expect(Math.abs(ice.w.bodies.kx[1])).toBeLessThan(0.1); // it would still be 3.2 if bodies slid
  });

  it('an earthquake knocks down everyone around you', () => {
    const { w, d, dummy } = range(2);
    d.queue('earth').tick({ buttons: BTN.area }, 2).tick({}, 15);
    expect(w.bodies.down[dummy] + (400 - w.bodies.hp[dummy])).toBeGreaterThan(0);
  });

  it('every non-structure cell of the grid compiles to a real shape', () => {
    const plain: Element[] = ['water', 'life', 'cold', 'lightning', 'arcane', 'fire', 'earth'];
    const todo: string[] = [];
    for (const a of plain) for (const b of [null, ...plain]) for (const cast of ['force', 'area', 'place', 'conjure'] as const) {
      const q = b ? [a, b] : [a];
      const spec = compile(q, cast);
      if (spec.shape === 'todo') todo.push(`${q.join('+')}/${cast}: ${spec.title}`);
    }
    expect(todo).toEqual([]);
  });
});

describe('counts layout', () => {
  it('N_EL matches the rules', () => expect(N_EL).toBe(9));
});
