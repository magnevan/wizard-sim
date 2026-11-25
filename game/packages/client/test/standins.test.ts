/**
 * The 3D stand-ins (view3d/fx/standins.ts) draw every spell family without throwing, and draw something for each:
 * each recipe is cast through the real sim by demo.ts's inputs and drawn every few ticks, as the game would. three.js
 * builds geometry without a GL context, so nothing is stubbed. Pixels are the shots' job (scripts/cast3d-shots.mjs).
 */
import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import { ARCH, KEYED_EL, MAX_SEATS, NO_INPUT, QUEUE_MAX, createWorld, devRefillRunes, devSpawnEnemy, devStage, step } from '@wizard-sim/sim';
import { demoInput, parseDemo } from '../src/demo';
import { Standins } from '../src/view3d/fx/standins';

/** A representative of every form × lead element (the 3D lab's sheets), each with the ticks it runs. */
const RECIPES = [
  'water,water,water/force', 'cold,cold/force', 'water,fire/force', 'arcane,arcane/force', 'life,life/force', 'lightning,lightning/force',
  'earth/force', 'earth,fire/force', 'ice,ice/force', 'fire,fire/area', 'lightning/area', 'earth,earth/area', 'life/area',
  'water,water/place', 'cold/place', 'ice/place', 'water,fire/place', 'earth/place', 'arcane/place', 'lightning/place', 'life/place',
  'shield,earth/drag', 'shield/drag', 'shield,fire/drag', 'shield,ice/drag', 'shield,earth/place', 'shield,water/force', 'shield/force',
  'shield/self', 'shield,earth/self', 'sigil/self', 'sigil,fire/self', 'shield/area', 'sigil/area',
  'sigil,fire/force', 'sigil,lightning/place', 'sigil,cold/drag', 'sigil,fire/area', 'sigil/place',
  'fire,fire/weapon', 'earth/weapon', 'fire,fire/hold', 'shield,earth/holddrag', 'fire/burstheld', 'arcane/ringheld',
];

describe('3D stand-ins', () => {
  test('every family draws, and never throws', () => {
    const cam = new THREE.PerspectiveCamera(28, 16 / 9, 0.5, 500);
    cam.position.set(0, 14, 13); cam.lookAt(0, 0, 0);
    const blank: string[] = [], thrown: string[] = [];
    for (const r of RECIPES) {
      const w = createWorld(7, 1, { room: 'sanctum', dummies: false });
      w.bodies.x[0] = -4; w.bodies.y[0] = 0;
      w.mode = { ...w.mode, runeMax: (_w, _i, id) => (id > KEYED_EL ? 0 : QUEUE_MAX) };
      devRefillRunes(w, 0);
      for (const [x, y] of [[1.5, 0], [2, 1.6], [2, -1.7]]) devSpawnEnemy(w, ARCH.swarmer, x, y);
      devStage(w, { hold: true, puppet: -1, goal: null, aim: 0 });   // held: no wind-up telegraphs to count
      const d = parseDemo(`${r}@1.5,0`)!, s = new Standins();
      s.drawFire = true; s.drawEarth = true;
      let most = 0;
      try {
        for (let k = 0; k < 150; k++) {
          step(w, Array.from({ length: MAX_SEATS }, (_, p) => (p === 0 ? demoInput(w, k, 0, d) : NO_INPUT)));
          s.afterStep(w);
          if (k % 5) continue;
          s.draw(w, { t: w.clock[0] / 60, alpha: 0.5, localSeat: 0, cam });
          const c = s.batch.counts;
          most = Math.max(most, c.glow + c.tint + c.solid);
        }
      } catch (e) { thrown.push(`${r}: ${(e as Error).message}`); }
      if (!most) blank.push(r);
    }
    expect(thrown).toEqual([]);
    expect(blank).toEqual([]);
  });

  test('a replayed step adds its events once; a rewind drops what came after', () => {
    const w = createWorld(7, 1, { room: 'sanctum', dummies: false });
    w.mode = { ...w.mode, runeMax: (_w, _i, id) => (id > KEYED_EL ? 0 : QUEUE_MAX) };
    devRefillRunes(w, 0);
    const d = parseDemo('fire,fire/area')!, s = new Standins();
    let burstTick = -1;
    for (let k = 0; k < 60 && burstTick < 0; k++) {
      step(w, Array.from({ length: MAX_SEATS }, (_, p) => (p === 0 ? demoInput(w, k, 0, d) : NO_INPUT)));
      s.afterStep(w);
      if (w.events.some((e) => e.kind === 'burst')) burstTick = w.clock[0];
    }
    expect(burstTick).toBeGreaterThan(0);
    const recs = () => (s as unknown as { recs: unknown[] }).recs.length;
    const n = recs();
    s.afterStep(w);   // the same step again, as a replay would
    expect(recs()).toBe(n);
    s.rewind(burstTick - 1);
    expect(recs()).toBeLessThan(n);
  });
});
