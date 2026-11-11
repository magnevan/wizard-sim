/**
 * The tools panel (F3, or the Tools button): cheats, time, spawning, waves, and sections other parts
 * of the client add (the Network test). The shell is debug-panel.ts.
 *
 * Cheats edit the world from outside step(), so a run that used one no longer replays from its
 * inputs: the Stats panel then says "dev-edited". Online they're off (they would desync the match).
 * While the panel is open: N spawns the chosen enemy at the cursor, P pauses, `.` steps one tick.
 */
import { perkOf } from './art/perks';
import {
  ARCHETYPES, KIND, MAX_SEATS, TEAM, devClearEnemies, devHeal, devRefillRunes, devSkipLull, devSpawnEnemy,
  devStartWave, devStopWaves, devRestartRun, grant, EL, N_PU, PU, type World,
} from '@wizard-sim/sim';
import type { Camera } from './camera';
import { DebugPanel, h, panelSection, renderFlags } from './debug-panel';

const SCALES = [0.25, 0.5, 1, 2];

export class ToolsPanel extends DebugPanel {
  timeScale = 1;
  paused = false;
  infiniteRunes = false;
  godMode = false;
  /** A cheat changed the world outside step(): the replay no longer reproduces this run. */
  devEdited = false;
  /** Online play (netplay.ts): cheats are off while this says so. */
  online: () => boolean = () => false;
  private steps = 0;
  private cursor: { x: number; y: number } | null = null;
  private arch = 1;
  /** Where added sections go (null until built). */
  private toolsEnd: Element | null = null;
  private extra: { label: string; fill: (body: HTMLElement) => void }[] = [];
  private el: Record<'msg' | 'pause' | 'flags', HTMLElement> | null = null;
  private scaleBtns: HTMLButtonElement[] = [];
  private toggles: { key: 'infiniteRunes' | 'godMode'; box: HTMLInputElement }[] = [];

  constructor(private world: World, private camera: Camera, canvas: HTMLElement, openNow = false) {
    super('right', 'F3', 'Tools', 'Debug tools', 2);
    canvas.addEventListener('pointermove', (e) => { this.cursor = { x: e.clientX, y: e.clientY }; });
    addEventListener('keydown', (e) => {
      if (!this.isOpen || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyN') this.spawn();
      else if (e.code === 'KeyP') this.setPaused(!this.paused);
      else if (e.code === 'Period') this.stepOnce();
    });
    if (openNow) this.toggle();
  }

  /** Steps queued by single-step while paused; the loop runs them and they reset. */
  takeSteps(): number { const n = this.steps; this.steps = 0; return n; }

  /** After every sim step: apply the cheats, so the next step starts topped up. */
  afterStep(): void {
    if (this.online()) return;
    const w = this.world;
    if (this.infiniteRunes) devRefillRunes(w, 0);
    if (this.godMode) for (let s = 0; s < MAX_SEATS; s++) if (w.bodies.kind[s] === KIND.wizard && w.bodies.team[s] === TEAM.players) devHeal(w, s);
  }

  /** For the Stats panel's flags. */
  flags(): string {
    return (this.devEdited ? '  dev-edited' : '') +
      (this.paused ? '  paused' : this.timeScale !== 1 ? `  ${this.timeScale}×` : '');
  }

  /** A section another part of the client fills (the Network test), placed after the tools. */
  addSection(label: string, fill: (body: HTMLElement) => void): void {
    this.extra.push({ label, fill });
    if (this.toolsEnd) this.placeSection(this.extra[this.extra.length - 1]);
  }

  // ---- actions ----

  private say(text: string): void { if (this.el) this.el.msg.textContent = text; }
  private cheat(): void { this.devEdited = true; this.renderFlags(); }
  private offline(): boolean { if (this.online()) { this.say('Cheats are off in an online match.'); return false; } return true; }
  private setPaused(p: boolean): void { this.paused = p; this.renderTime(); }
  private stepOnce(): void { this.setPaused(true); this.steps++; }

  private spawn(): void {
    if (!this.offline()) return;
    const w = this.world;
    let x = w.bodies.x[0] + 3, y = w.bodies.y[0];
    if (this.cursor) ({ x, y } = this.camera.screenToWorld(this.cursor.x, this.cursor.y));
    const hx = w.dims.w / 2 - 0.6, hy = w.dims.h / 2 - 0.6;
    devSpawnEnemy(w, this.arch, Math.max(-hx, Math.min(hx, x)), Math.max(-hy, Math.min(hy, y)));
    this.cheat();
  }

  protected override onOpen(): void { this.renderTime(); for (const t of this.toggles) t.box.checked = this[t.key]; }

  // ---- building ----

  protected fill(root: HTMLDivElement): void {
    const flags = h('div', 'tune-flags');
    const msg = h('div', 'tune-msg');
    const pause = h('button', '', 'Pause');
    root.append(flags, msg);
    this.el = { msg, pause, flags };

    const cheats = panelSection('Cheats', true, root);
    const tg = h('div', 'tune-line');
    for (const [key, label] of [['infiniteRunes', 'Infinite runes'], ['godMode', 'God mode']] as const) {
      const lab = h('label', 'tune-check'), box = h('input');
      box.type = 'checkbox';
      box.addEventListener('change', () => { if (box.checked && !this.offline()) { box.checked = false; return; } this[key] = box.checked; if (box.checked) this.cheat(); });
      lab.append(box, document.createTextNode(label));
      tg.appendChild(lab); this.toggles.push({ key, box });
    }
    const act = (label: string, fn: () => void, tip = '') => { const b = h('button', '', label); if (tip) b.title = tip; b.addEventListener('click', () => { if (!this.offline()) return; fn(); this.cheat(); }); return b; };
    const misc = h('div', 'tune-line');
    misc.append(act('Clear enemies', () => devClearEnemies(this.world)), act('Refill runes', () => devRefillRunes(this.world, 0)), act('Heal', () => devHeal(this.world, 0)));
    cheats.append(tg, misc);

    const timeB = panelSection('Time', true, root);
    const time = h('div', 'tune-line');
    for (const s of SCALES) {
      const b = h('button', 'seg', `${s}×`);
      b.addEventListener('click', () => { this.timeScale = s; this.renderTime(); });
      this.scaleBtns.push(b); time.appendChild(b);
    }
    pause.title = 'P while the panel is open';
    pause.addEventListener('click', () => this.setPaused(!this.paused));
    const stepB = h('button', '', 'Step'); stepB.title = 'One tick (. while the panel is open)';
    stepB.addEventListener('click', () => this.stepOnce());
    time.append(pause, stepB);
    timeB.appendChild(time);

    const enemies = panelSection('Enemies and waves', true, root);
    const sp = h('div', 'tune-line');
    const sel = h('select');
    ARCHETYPES.forEach((a, i) => { if (i === 0) return; const o = h('option', '', a.name); o.value = String(i); sel.appendChild(o); });
    sel.addEventListener('change', () => { this.arch = Number(sel.value); });
    const spawnB = h('button', '', 'Spawn at cursor'); spawnB.title = 'N while the panel is open';
    spawnB.addEventListener('click', () => this.spawn());
    sp.append(h('span', 'tune-k', 'Enemy'), sel, spawnB);
    enemies.appendChild(sp);

    const wv = h('div', 'tune-line');
    const wn = h('input', 'tune-num'); wn.type = 'number'; wn.min = '1'; wn.step = '1'; wn.value = '1';
    wv.append(h('span', 'tune-k', 'Wave'), wn,
      act('Start', () => devStartWave(this.world, Math.max(1, Number(wn.value) || 1), 2), 'Clears the field, then wave N after a 2 s lull'),
      act('Skip lull', () => devSkipLull(this.world)),
      act('Stop', () => devStopWaves(this.world), 'Stops the wave director; enemies stay'));
    enemies.appendChild(wv);
    if (this.world.run) {
      // Survive: a new run, or a power-up for P1 without walking to an altar.
      const sv = h('div', 'tune-line');
      const pu = h('select');
      for (let k = 1; k < N_PU; k++) { const o = h('option', '', perkOf(k, k === PU.deepEl ? EL.fire : 0).name); o.value = String(k); pu.appendChild(o); }
      sv.append(h('span', 'tune-k', 'Survive'), act('New run', () => devRestartRun(this.world), 'Starts a new run now (Space does it on the run-over screen)'),
        pu, act('Give P1', () => grant(this.world, 0, Number(pu.value), Number(pu.value) === PU.deepEl ? EL.fire : 0), 'P1 takes this power-up now'));
      enemies.appendChild(sv);
    }
    this.toolsEnd = enemies.parentElement!;
    for (const x of this.extra) this.placeSection(x);
  }

  private placeSection(x: { label: string; fill: (body: HTMLElement) => void }): void {
    const holder = document.createElement('div');
    const body = panelSection(x.label, false, holder);
    const det = holder.firstElementChild!;
    this.toolsEnd!.after(det);
    this.toolsEnd = det;
    x.fill(body);
  }

  // ---- rendering ----

  private renderTime(): void {
    if (!this.el) return;
    this.scaleBtns.forEach((b, k) => b.classList.toggle('on', SCALES[k] === this.timeScale));
    this.el.pause.textContent = this.paused ? 'Resume' : 'Pause';
    this.el.pause.classList.toggle('on', this.paused);
    this.renderFlags();
  }

  private renderFlags(): void { if (this.el) renderFlags(this.el.flags, this.flags()); }
}
