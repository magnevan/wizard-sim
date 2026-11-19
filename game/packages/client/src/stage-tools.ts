/**
 * The Tools panel's Stage section (F3), the Model Viewer's play area (/models.html opens the Sanctum with ?stage=1):
 * the real game, set up for looking at bodies rather than fighting them.
 *
 *   Hold enemies still   every enemy stands where it is; blows still flinch it, knock it about and kill it.
 *   Puppet               one enemy driven with the mouse as you drive your wizard: hold the left button and it walks
 *                        toward the cursor (let go and it stops); right-click attacks toward the cursor. A wizard there (yours: God mode keeps you up) is struck, shot or grabbed by
 *                        the core's own attack code; with nobody there it swings at the air. Standing, it faces the cursor.
 *                        While a puppet is held the mouse is the puppet's; the keyboard still drives your wizard.
 *   Weapon               conjure any weapon (or the wand) at once, and it doesn't wear out.
 *   Guard                conjure any of the eight guards at once, at full strength.
 *
 * All of it is dev world edits (sim dev.ts: devStage wraps the mode's enemy rules), off online like every cheat.
 * While the panel is open, K takes the enemy nearest the cursor as the puppet (or lets it go).
 */
import { AI, ARCHETYPES, DEV_GUARDS, DEV_WEAPONS, KIND, STRUCT, atan2Turns, devConjure, devGuard, devPuppetAttack, devSpawnEnemy, devStage, devStageOff, type DevStage, type World } from '@wizard-sim/sim';
import type { Camera } from './camera';
import { h } from './debug-panel';

export class StageTools {
  readonly st: DevStage = { hold: false, puppet: -1, goal: null, aim: 0.25 };
  private cursor: { x: number; y: number } | null = null;
  private buttons = 0;
  private picking = false;
  private arch = 1;
  private msg: HTMLElement | null = null;
  private holdBox: HTMLInputElement | null = null;
  /** The weapon a button gave P1 (an EL id): kept topped up while P1 holds it. */
  private kept = 0;

  /** `cheat` marks the run dev-edited and says whether cheats are allowed (offline). */
  constructor(private world: World, private camera: Camera, private canvas: HTMLElement, private cheat: () => boolean, private panelOpen: () => boolean) {
    // the capture phase on window runs before the game's own listeners on the canvas (input.ts), so a held puppet
    // takes the mouse and the wizard doesn't walk or cast
    const mine = (e: Event) => e.target === this.canvas && (this.st.puppet >= 0 || this.picking);
    addEventListener('pointerdown', (e) => {
      if (!mine(e)) return;
      e.stopImmediatePropagation(); e.preventDefault();
      this.cursor = { x: e.clientX, y: e.clientY };
      this.press(e.buttons & ~this.buttons & 3);
      this.buttons = e.buttons & 3;
    }, true);
    addEventListener('pointermove', (e) => {
      if (e.target === this.canvas) this.cursor = { x: e.clientX, y: e.clientY };
      if (!mine(e)) { this.buttons = e.buttons & 3; return; }
      e.stopImmediatePropagation();
      // a second button pressed while one is held comes only as a move (a chord)
      this.press(e.buttons & ~this.buttons & 3);
      this.buttons = e.buttons & 3;
      if (!(this.buttons & 1)) this.st.goal = null;
    }, true);
    // a release anywhere (off the canvas too) stops the walk
    addEventListener('pointerup', (e) => {
      if (this.st.puppet < 0) return;
      if (mine(e)) e.stopImmediatePropagation();
      this.buttons = e.buttons & 3;
      if (!(this.buttons & 1)) this.st.goal = null;
    }, true);
    addEventListener('blur', () => { this.buttons = 0; this.st.goal = null; });
    addEventListener('keydown', (e) => {
      if (!this.panelOpen() || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.code !== 'KeyK') return;
      if (this.st.puppet >= 0) this.release(); else this.take(this.nearestEnemy(this.at(), Infinity));
    });
  }

  /** Is any of it on (so the run counts as dev-edited, and devStage runs)? */
  get on(): boolean { return this.st.hold || this.st.puppet >= 0; }

  setHold(on: boolean): void {
    if (on && !this.cheat()) return;
    this.st.hold = on;
    if (this.holdBox) this.holdBox.checked = on;
    this.sync();
  }

  /** After every sim step. */
  afterStep(): void {
    const w = this.world, b = w.bodies, st = this.st, i = st.puppet;
    if (i >= 0 && b.kind[i] !== KIND.enemy) this.release('The puppet is gone.');
    if (this.kept && w.seats.weapon[0] === this.kept) w.seats.weaponUses[0] = STRUCT.weaponUses;
    else this.kept = 0;
    this.sync();
    // walking while the left button is held: toward the cursor, wherever it is now (the camera may have moved)
    if (i >= 0 && this.buttons & 1) { const p = this.at(); st.goal = [p.x, p.y]; }
    // a puppet standing still faces the cursor, so every facing can be looked at
    if (i >= 0 && b.kind[i] === KIND.enemy && !st.goal && b.ai[i] === AI.approach && this.cursor) {
      const p = this.at();
      if (Math.hypot(p.x - b.x[i], p.y - b.y[i]) > 0.3) b.face[i] = atan2Turns(p.y - b.y[i], p.x - b.x[i]);
    }
  }

  private sync(): void { if (this.on) devStage(this.world, this.st); else devStageOff(this.world); }

  private at(): { x: number; y: number } {
    const w = this.world;
    const p = this.cursor ? this.camera.screenToWorld(this.cursor.x, this.cursor.y) : { x: w.bodies.x[0], y: w.bodies.y[0] };
    const hx = w.dims.w / 2 - 0.6, hy = w.dims.h / 2 - 0.6;
    return { x: Math.max(-hx, Math.min(hx, p.x)), y: Math.max(-hy, Math.min(hy, p.y)) };
  }

  private press(down: number): void {
    if (!down) return;
    const p = this.at();
    if (this.picking) { this.picking = false; this.take(this.nearestEnemy(p, 2)); return; }
    const i = this.st.puppet;
    if (i < 0 || !this.cheat()) return;
    if (down & 1) this.st.goal = [p.x, p.y];
    if (down & 2) devPuppetAttack(this.world, i, p.x, p.y, this.st);
  }

  private nearestEnemy(p: { x: number; y: number }, within: number): number {
    const b = this.world.bodies;
    let best = -1, d0 = within;
    for (let i = 0; i < b.kind.length; i++) {
      if (b.kind[i] !== KIND.enemy) continue;
      const d = Math.hypot(b.x[i] - p.x, b.y[i] - p.y);
      if (d < d0) { d0 = d; best = i; }
    }
    return best;
  }

  private take(i: number): void {
    if (i < 0) { this.say('No enemy there. Spawn one (N, or Spawn as puppet).'); return; }
    if (!this.cheat()) return;
    Object.assign(this.st, { puppet: i, goal: null, aim: this.world.bodies.face[i] });
    this.sync();
    this.say(`Puppet: ${ARCHETYPES[this.world.bodies.arch[i]].name} (#${i}). Hold left to walk it toward the cursor, right-click attacks; K lets go.`);
  }

  private release(why = ''): void {
    this.st.puppet = -1; this.st.goal = null; this.picking = false;
    this.sync();
    this.say(why || 'No puppet: the mouse drives your wizard again.');
  }

  private say(t: string): void { if (this.msg) this.msg.textContent = t; }

  /** The section's controls, in the Tools panel. */
  fill(body: HTMLElement): void {
    const line = () => { const l = h('div', 'tune-line'); body.appendChild(l); return l; };
    const btn = (label: string, fn: () => void, tip = '') => { const b = h('button', '', label); if (tip) b.title = tip; b.addEventListener('click', fn); return b; };

    const holdLab = h('label', 'tune-check'), hold = h('input');
    hold.type = 'checkbox'; hold.checked = this.st.hold; this.holdBox = hold;
    hold.addEventListener('change', () => this.setHold(hold.checked));
    holdLab.title = 'Every enemy but the puppet stands where it is; blows still flinch, knock back and kill it';
    holdLab.append(hold, document.createTextNode('Hold enemies still'));
    line().append(holdLab);

    const sel = h('select');
    ARCHETYPES.forEach((a, k) => { if (k === 0 || a.passive) return; const o = h('option', '', a.name); o.value = String(k); sel.appendChild(o); });
    sel.addEventListener('change', () => { this.arch = Number(sel.value); });
    line().append(h('span', 'tune-k', 'Puppet'), sel, btn('Spawn as puppet', () => {
      if (!this.cheat()) return;
      const p = this.at(), w = this.world;
      this.take(devSpawnEnemy(w, this.arch, p.x, p.y));
    }, 'A new enemy at the cursor, driven by you'));
    line().append(
      btn('Pick one', () => { this.picking = true; this.say('Click an enemy to drive it.'); }, 'Then click an enemy (or K: the one nearest the cursor)'),
      btn('Let go', () => this.release(), 'K while the panel is open'));
    this.msg = h('div', 'tune-msg', 'Hold left to walk a puppet toward the cursor, right-click to attack toward it (a wizard there is struck for real: turn on God mode).');
    body.appendChild(this.msg);

    const wl = line();
    wl.append(h('span', 'tune-k', 'Weapon'));
    const give = (what: number | 'wand') => { if (!this.cheat()) return; devConjure(this.world, 0, what); this.kept = what === 'wand' ? 0 : what; };
    for (const [name, what] of DEV_WEAPONS) wl.append(btn(name.split(' ')[0], () => give(what), `P1 conjures the ${name}; it doesn't wear out`));
    wl.append(btn('none', () => give(0), 'Put it away'));
    const gl = line();
    gl.append(h('span', 'tune-k', 'Guard'));
    const guard = (id: number) => { if (this.cheat()) devGuard(this.world, 0, id); };
    for (const [name, id] of DEV_GUARDS) gl.append(btn(name, () => guard(id), `P1 conjures the ${name} guard at full strength`));
    gl.append(btn('none', () => guard(0), 'Put it away'));
    if (import.meta.env.DEV) {
      body.appendChild(h('div', 'tune-msg', 'Previewing and placing weapons and guards on the wizard model is in the Model Viewer.'));
      const a = h('a', '', 'Model Viewer');
      a.href = './models.html'; a.target = '_blank';
      line().append(a);
    }
  }
}
