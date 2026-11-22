// Vistas (vista.ts): a marker tagged vista plays once per visit when a wizard comes near, then hands back.
import { describe, expect, it } from 'vitest';
import type { RoomDef } from '@wizard-sim/sim';
import { VISTA_HOLD, VISTA_IN, VISTA_OUT, Vistas } from '../src/vista';

const def = (id = 'court') => ({ id, markers: [{ id: 'vista-1', x: 0, y: 10, tag: 'vista' }, { id: 'armillary', x: 0, y: 0, tag: 'landmark' }] }) as unknown as RoomDef;
const land = () => ({ x: 0, foot: 0, top: -40 });
const fit = (span: number) => (span > 30 ? 2 : 4);

describe('camera vistas', () => {
  it('plays once when a wizard comes near, frames the landmark top to the wizard, then hands back', () => {
    const v = new Vistas();
    expect(v.update(def(), [{ x: 20, y: 10 }], 0, land, fit)).toBeNull(); // too far
    const s = v.update(def(), [{ x: 1, y: 10 }], 1, land, fit)!;
    expect(s).toMatchObject({ x: 0.5, top: -41, scale: 2, out: false }); // landmark top -40 and the wizard at 10: 52 u, pulled back
    expect(v.update(def(), [{ x: 1, y: 10 }], 1 + VISTA_IN + VISTA_HOLD + 0.1, land, fit)!.out).toBe(true);
    expect(v.update(def(), [{ x: 1, y: 10 }], 1 + VISTA_IN + VISTA_HOLD + VISTA_OUT + 0.1, land, fit)).toBeNull();
    expect(v.update(def(), [{ x: 1, y: 10 }], 10, land, fit)).toBeNull(); // played: not again this visit
    v.update(def('yard'), [], 11, land, fit); // another room
    expect(v.update(def(), [{ x: 1, y: 10 }], 12, land, fit)).not.toBeNull(); // a new visit plays it again
  });

  it('needs a landmark to look at', () => {
    expect(new Vistas().update(def(), [{ x: 0, y: 10 }], 0, () => null, fit)).toBeNull();
  });
});
