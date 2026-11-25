/**
 * Spell light: a fixed pool of real point lights in the world scene, handed out each frame to the brightest requests.
 * The pool never grows or shrinks (unused lights sit at intensity 0), so three never recompiles the world's materials
 * when a spell starts or stops. Effects ask with `add()` between `begin()` and `end()`; past the budget the dimmest
 * requests are dropped (a crowd of spells lights the room by its strongest few).
 */
import * as THREE from 'three';

/** Lights in the pool: each one costs every lit fragment of the world a little, so keep it small. */
export const LIGHT_BUDGET = 8;

interface Req { x: number; y: number; z: number; color: THREE.Color; intensity: number; range: number }

export class SpellLights {
  readonly group = new THREE.Group();
  private pool: THREE.PointLight[] = [];
  private reqs: Req[] = [];
  /** Requests last frame, and how many of them got a light. */
  readonly stats = { asked: 0, lit: 0 };

  constructor(budget = LIGHT_BUDGET) {
    for (let i = 0; i < budget; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 1, 2);
      this.pool.push(l); this.group.add(l);
    }
  }

  begin(): void { this.reqs.length = 0; }

  /** A light at (x, y, z) (three's space, u) of this colour; intensity in candela (three's units), reaching `range` u. */
  add(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, range: number): void {
    if (intensity > 0) this.reqs.push({ x, y, z, color: new THREE.Color(color), intensity, range });
  }

  end(): void {
    const r = this.reqs.sort((a, b) => b.intensity - a.intensity);
    this.stats.asked = r.length; this.stats.lit = Math.min(r.length, this.pool.length);
    this.pool.forEach((l, i) => {
      const q = r[i];
      if (!q) { l.intensity = 0; return; }
      l.position.set(q.x, q.y, q.z); l.color.copy(q.color); l.intensity = q.intensity; l.distance = q.range;
    });
  }
}
