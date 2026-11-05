/**
 * Inspect: hold Alt and a card names what's under the cursor, and what it does. Enemies, wizards
 * and dummies (health, statuses, quirks), walls (whose, elements, what crossing or touching does),
 * Sigil devices, wards on a wizard, and the floor. Reading only: the game keeps running, and the
 * card is plain DOM text beside the cursor. A start, to grow as the game does.
 */
import { rules, type Element } from '@wizard-sim/rules';
import { ARCHETYPES, ARENA, CELL, DEVICE, GRID_H, GRID_W, KIND, MAX_DEVICES, MAX_SEATS, MAX_WALLS, N_EL, SURF, WALL, WARD, elementName, type World } from '@wizard-sim/sim';
import type { Camera } from './camera';

const HOVER = 0.9;
const elName = (id: number) => rules.ELEMENTS[elementName(id) as Element].name;

/** The elements in a 9-per-slot counts array, as "Fire ×2, Life". */
function elements(els: Uint8Array, at: number, skip: number[] = []): string {
  const out: string[] = [];
  for (let id = 1; id <= N_EL; id++) {
    const n = els[at * N_EL + id - 1];
    if (n && !skip.includes(id)) out.push(n > 1 ? `${elName(id)} ×${n}` : elName(id));
  }
  return out.join(', ');
}

const ID = (el: Element) => rules.BASE.indexOf(el) + 1;
const owner = (seat: number) => (seat >= 0 && seat < MAX_SEATS ? `Player ${seat + 1}'s` : 'A');

export class Inspect {
  private el: HTMLDivElement;
  private on = false;
  private sx = 0;
  private sy = 0;

  constructor(private world: World, private camera: Camera) {
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;z-index:30;pointer-events:none;display:none;max-width:260px;font:12px/1.4 ui-monospace,Consolas,monospace;color:#ecebf2;background:rgba(13,11,20,.92);border:1px solid #5a5078;border-radius:6px;padding:6px 8px;box-shadow:0 2px 10px rgba(0,0,0,.4)';
    document.body.appendChild(el);
    // Alt alone would move focus to the browser's menu on key-up: keep it for the game.
    addEventListener('keydown', (e) => { if (e.key === 'Alt') { e.preventDefault(); this.on = true; } });
    addEventListener('keyup', (e) => { if (e.key === 'Alt') { e.preventDefault(); this.on = false; } });
    addEventListener('blur', () => { this.on = false; });
    addEventListener('pointermove', (e) => { this.sx = e.clientX; this.sy = e.clientY; });
  }

  /** Call every frame: show or hide the card, and fill it for what's under the cursor. */
  frame(): void {
    if (!this.on) { this.el.style.display = 'none'; return; }
    const p = this.camera.screenToWorld(this.sx, this.sy);
    const lines = this.describe(p.x, p.y);
    this.el.replaceChildren(...lines.map((l, i) => {
      const d = document.createElement('div');
      d.textContent = l;
      if (i === 0) d.style.cssText = 'font-weight:bold;color:#f2c44a';
      else if (l.startsWith('·')) d.style.color = '#a8a3bb';
      return d;
    }));
    this.el.style.display = 'block';
    const x = Math.min(this.sx + 16, innerWidth - this.el.offsetWidth - 8), y = Math.min(this.sy + 12, innerHeight - this.el.offsetHeight - 8);
    this.el.style.left = `${Math.max(8, x)}px`; this.el.style.top = `${Math.max(8, y)}px`;
  }

  /** The nearest thing under (x, y): a body, a device, a wall, else the floor. */
  describe(x: number, y: number): string[] {
    const w = this.world, b = w.bodies;
    let body = -1, bd = HOVER;
    for (let i = 0; i < b.kind.length; i++) {
      if (!b.kind[i]) continue;
      const d = Math.hypot(b.x[i] - x, b.y[i] - y) - b.r[i];
      if (d < bd) { bd = d; body = i; }
    }
    if (body >= 0) return this.body(body);
    const dv = w.devices;
    for (let k = 0; k < MAX_DEVICES; k++) {
      if (!dv.type[k]) continue;
      const d = dv.type[k] === DEVICE.lineglyph ? segDist(x, y, dv.x[k], dv.y[k], dv.x2[k], dv.y2[k]) : Math.hypot(dv.x[k] - x, dv.y[k] - y);
      if (d < HOVER) return this.device(k);
    }
    const wl = w.walls;
    for (let k = 0; k < MAX_WALLS; k++) if (wl.type[k] && segDist(x, y, wl.x1[k], wl.y1[k], wl.x2[k], wl.y2[k]) < 0.6) return this.wall(k);
    return this.floor(x, y);
  }

  private body(i: number): string[] {
    const w = this.world, b = w.bodies, s = w.seats;
    const k = b.kind[i];
    const a = ARCHETYPES[b.arch[i]];
    const name = k === KIND.wizard ? `Player ${i + 1}` : k === KIND.dummy ? 'Training dummy' : k === KIND.double ? 'The Double' : a?.name || 'Enemy';
    const out = [name, `Health ${Math.ceil(b.hp[i])} / ${Math.round(b.maxHp[i])}`];
    const st: string[] = [];
    if (b.wet[i] > 0) st.push('wet (lightning hurts more, cold freezes)');
    if (b.burn[i] > 0) st.push('burning');
    if (b.chill[i] > 0.05) st.push(`chilled ${Math.round(b.chill[i] * 100) / 100} (slower)`);
    if (b.frozen[i] > 0) st.push('frozen (shatters from a hard hit)');
    if (b.stun[i] > 0) st.push('stunned');
    if (b.expose[i] > 0) st.push('exposed');
    if (b.downed[i] || b.down[i] > 0) st.push('down');
    if (st.length) out.push(`· ${st.join(' · ')}`);
    if (k === KIND.enemy && a) {
      if (a.question) out.push(`· ${a.question}`);
      if (a.fireMult === 0) out.push('· fire does nothing to it; cold hurts more; getting wet hurts');
      if (a.guard) out.push('· guards its front: hit it from the side or behind');
      if (a.grab) out.push('· grabs and drags: hurt it to break free');
    }
    if (k === KIND.wizard && i < MAX_SEATS) {
      const ward = s.ward[i];
      if (ward) out.push(`· ${ward === WARD.mirror ? 'mirror ward (sends shots back)' : ward === WARD.stone ? 'stone ward' : 'ward'}${elements(s.wardEls, i, [ID('shield')]) ? `: resists ${elements(s.wardEls, i, [ID('shield'), ID('earth')])}` : ''}`);
      if (s.aura[i] > 0) out.push(`· aura: ${elements(s.auraEls, i, [ID('sigil')])}`);
      if (s.guard[i]) out.push('· holding a conjured guard');
      if (s.weapon[i]) out.push(`· holding a conjured ${elName(s.weapon[i])} weapon (${s.weaponUses[i]} uses)`);
    }
    return out;
  }

  private device(k: number): string[] {
    const dv = this.world.devices, ty = dv.type[k], els = elements(dv.els, k, [ID('sigil')]);
    const who = owner(dv.owner[k]);
    if (ty === DEVICE.turret) return [`${who} turret`, `Carries ${els || 'nothing'}`, '· casts that Force spell at the nearest enemy, paid from its owner\'s runes; channels a spray or beam', dv.chan[k] > 0 ? '· channelling now' : '· slower when its owner is short of regen'];
    if (ty === DEVICE.glyph || ty === DEVICE.lineglyph) return [`${who} ${ty === DEVICE.lineglyph ? 'line glyph' : 'glyph'}`, `Carries ${els || 'nothing'}`, dv.heal[k] ? '· goes off when an ally steps on it' : '· goes off when an enemy steps on it', dv.timer[k] > 0 ? '· still arming' : '· armed'];
    if (ty === DEVICE.lens) return [`${who} lens`, '· whatever passes through it comes out stronger'];
    if (ty === DEVICE.orbital) return [`${who} orbitals`, `Carry ${els || 'nothing'}`, `· ${dv.charges[k]} left: each strikes the first enemy close by`];
    return ['Device'];
  }

  private wall(k: number): string[] {
    const wl = this.world.walls, ty = wl.type[k], who = owner(wl.owner[k]);
    const coat = elements(wl.els, k, [ID('shield'), ID('earth')]);
    const hp = `Health ${Math.ceil(wl.hp[k])} / ${Math.round(wl.maxHp[k])}`;
    if (ty === WALL.rock) return [`${who} stone wall`, hp, '· blocks bodies and shots', coat ? `· coated with ${coat}: pulses on whoever touches it` : '· plain stone'];
    if (ty === WALL.curtain) return [`${who} curtain`, `${coat || 'no elements'}`, hp, '· walk through it: crossing or standing in it pulses its elements', '· beams through it pick them up', '· double-tap Shield over it to dismiss (your own)'];
    if (ty === WALL.barrier) return [`${who} barrier`, hp, '· blocks shots, drains its owner\'s Shield pool while it stands'];
    return ['Wall'];
  }

  private floor(x: number, y: number): string[] {
    const cx = Math.floor((x + ARENA.w / 2) / CELL), cy = Math.floor((y + ARENA.h / 2) / CELL);
    if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) return ['Outside the arena'];
    const kind = this.world.surf.kind[cy * GRID_W + cx];
    if (kind === SURF.water) return ['Wet floor', '· whoever stands in it gets wet', '· lightning through it spreads; cold freezes it to ice'];
    if (kind === SURF.ice) return ['Ice', '· slippery: hard to stop or turn'];
    if (kind === SURF.fire) return ['Burning floor', '· sets whoever stands in it burning', '· water puts it out'];
    return ['Floor'];
  }
}

/** Distance from (x, y) to the segment (ax, ay)-(bx, by). */
function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}
