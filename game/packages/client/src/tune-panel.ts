/**
 * The debug and tuning panel (F1, or the Tune button): play, nudge a number, feel it, keep it.
 *
 * It is a plain DOM overlay on the right edge, built the first time it opens, so a closed panel
 * costs nothing but the meters' event tally. Tuning writes go straight into the sim's config
 * tables through tunables() and take effect on the next tick; they persist in localStorage.
 * Cheats edit the world from outside step(), so a run that used one no longer replays from its
 * inputs: the debug line then says "dev-edited" (and "tuned" whenever the tuning hash isn't 0).
 *
 * Input hygiene: key events from the panel's fields stop at the panel root, so typing a number
 * never queues an element (or hits the 1 / 2 room switch), and buttons drop focus after a click
 * so Space and the element keys go back to the game. The panel is a sibling of the canvas, so
 * clicks on it never reach the canvas's walk / cast handlers.
 */
import { perkOf } from './art/perks';
import {
  ARCHETYPES, ARENA, KIND, MAX_SEATS, TEAM, devClearEnemies, devHeal, devRefillRunes, devSkipLull, devSpawnEnemy,
  devStartWave, devStopWaves, devRestartRun, grant, EL, N_PU, PU, findTunable, tunables, tuningHash, hex, type Tunable, type World,
} from '@wizard-sim/sim';
import type { Camera } from './camera';
import { Meters } from './meters';
import { exportText, parseOverrides, replaceTuning, saveTuning } from './tune-io';

/** The knobs that change how the game feels most, pinned at the top. */
const FEEL: [string, string][] = [
  ['runes.regen', 'Rune regen /s'], ['rhythm.windup', 'Wind-up s'], ['rhythm.windupPerRune', 'Wind-up per rune'], ['rhythm.recovery', 'Recovery s'],
  ['combat.channelRate', 'Channel rate'], ['body.walkSpeed', 'Walk speed'], ['body.castWalk', 'Walk while casting'], ['waves.lull', 'Wave lull s'],
];
const SCALES = [0.25, 0.5, 1, 2];

interface Row { t: Tunable; el: HTMLElement; range: HTMLInputElement; num: HTMLInputElement; dot: HTMLButtonElement }
interface Section { group: string; det: HTMLDetailsElement; count: HTMLElement; rows: Row[]; wasOpen: boolean }

const decimals = (step: number): number => (step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step) - 1e-9)));
const fmt = (v: number): string => String(Number(v.toFixed(6)));
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class TunePanel {
  readonly meters = new Meters(0);
  timeScale = 1;
  paused = false;
  infiniteRunes = false;
  godMode = false;
  /** A cheat changed the world outside step(): the replay no longer reproduces this run. */
  devEdited = false;
  isOpen = false;
  private steps = 0;
  private tuned = tuningHash() !== 0;
  private root: HTMLDivElement | null = null;
  private button: HTMLButtonElement;
  private cursor: { x: number; y: number } | null = null;
  private rows = new Map<string, Row[]>();
  private sections: Section[] = [];
  /** The Tools section, which added sections follow (null until built). */
  private toolsSec: Element | null = null;
  private lastExtra: Element | null = null;
  private extra: { label: string; fill: (body: HTMLElement) => void }[] = [];
  private arch = 1;
  private nextMeters = 0;
  private el: Record<'hash' | 'meters' | 'export' | 'import' | 'msg' | 'pause' | 'flags', HTMLElement> | null = null;
  private scaleBtns: HTMLButtonElement[] = [];
  private toggles: { key: 'infiniteRunes' | 'godMode'; box: HTMLInputElement }[] = [];

  constructor(private world: World, private camera: Camera, canvas: HTMLElement, openNow = false) {
    injectStyle();
    this.button = h('button', 'tune-btn', 'Tune');
    this.button.title = 'Debug and tuning panel (F1)';
    this.button.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.button);
    canvas.addEventListener('pointermove', (e) => { this.cursor = { x: e.clientX, y: e.clientY }; });
    // capture, so F1 works even while a field in the panel has focus
    addEventListener('keydown', (e) => { if (e.code === 'F1') { e.preventDefault(); if (!e.repeat) this.toggle(); } }, true);
    addEventListener('keydown', (e) => {
      if (!this.isOpen || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyN') this.spawn();
      else if (e.code === 'KeyP') this.setPaused(!this.paused);
      else if (e.code === 'Period') this.stepOnce();
    });
    if (openNow) this.toggle();
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen && !this.root) this.build();
    this.root!.style.display = this.isOpen ? '' : 'none';
    this.button.style.display = this.isOpen ? 'none' : '';
    if (this.isOpen) { this.refreshAll(); this.nextMeters = 0; }
    else (document.activeElement as HTMLElement | null)?.blur?.();
  }

  /** Steps queued by single-step while paused; the loop runs them and they reset. */
  takeSteps(): number { const n = this.steps; this.steps = 0; return n; }

  /** After every sim step: count the meters, then apply the cheats (so the next step starts topped up). */
  afterStep(): void {
    const w = this.world;
    this.meters.step(w.clock[0], w.events, {
      castRunes: (seat) => w.seats.castLen[seat],
      isEnemy: (i) => w.bodies.kind[i] === KIND.enemy,
      encPhase: () => w.enc.state[0],
      waveNo: () => w.enc.state[1],
    });
    if (this.infiniteRunes) devRefillRunes(w, 0);
    if (this.godMode) for (let s = 0; s < MAX_SEATS; s++) if (w.bodies.kind[s] === KIND.wizard && w.bodies.team[s] === TEAM.players) devHeal(w, s);
  }

  /** Once per drawn frame: refresh the meters a few times a second, and only while open. */
  frame(now: number): void {
    if (!this.isOpen || now < this.nextMeters) return;
    this.nextMeters = now + 250;
    this.renderMeters();
  }

  /** For the debug line. */
  flags(): string {
    return (this.tuned ? '  tuned' : '') + (this.devEdited ? '  dev-edited' : '') +
      (this.paused ? '  paused' : this.timeScale !== 1 ? `  ${this.timeScale}×` : '');
  }

  // ---- actions ----

  private cheat(): void { this.devEdited = true; this.renderFlags(); }

  private setPaused(p: boolean): void { this.paused = p; this.renderTime(); }
  private stepOnce(): void { this.setPaused(true); this.steps++; }

  private spawn(): void {
    const w = this.world;
    let x = w.bodies.x[0] + 3, y = w.bodies.y[0];
    if (this.cursor) ({ x, y } = this.camera.screenToWorld(this.cursor.x, this.cursor.y));
    const hx = ARENA.w / 2 - 0.6, hy = ARENA.h / 2 - 0.6;
    devSpawnEnemy(w, this.arch, Math.max(-hx, Math.min(hx, x)), Math.max(-hy, Math.min(hy, y)));
    this.cheat();
  }

  private setValue(t: Tunable, v: number): void {
    if (!Number.isFinite(v)) return;
    t.set(v);
    this.changed([t.id]);
  }

  /** After any tuning write: refresh those rows (or all), save, and update the hash and export. */
  private changed(ids?: string[]): void {
    if (ids) for (const id of ids) for (const r of this.rows.get(id) ?? []) this.renderRow(r);
    else for (const rs of this.rows.values()) for (const r of rs) this.renderRow(r);
    saveTuning();
    const hash = tuningHash();
    this.tuned = hash !== 0;
    if (!this.el) return;
    this.el.hash.textContent = this.tuned ? `tuning ${hex(hash)}` : 'defaults';
    this.el.hash.classList.toggle('on', this.tuned);
    (this.el.export as HTMLTextAreaElement).value = exportText();
    for (const s of this.sections) {
      const n = s.rows.filter((r) => r.t.get() !== r.t.def).length;
      s.count.textContent = n ? `${n} changed` : '';
    }
    this.renderFlags();
  }

  private refreshAll(): void { this.changed(); this.renderTime(); for (const t of this.toggles) t.box.checked = this[t.key]; }

  // ---- building ----

  private build(): void {
    const root = this.root = h('div', 'tune');
    root.style.display = 'none';
    // fields keep their keys: nothing typed here reaches the game's window listeners
    const fieldKeys = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return;
      e.stopPropagation();
      const el = e.target as HTMLInputElement;
      if (e.type === 'keydown' && (e.key === 'Escape' || (e.key === 'Enter' && tag !== 'TEXTAREA'))) el.blur();
    };
    root.addEventListener('keydown', fieldKeys);
    root.addEventListener('keyup', fieldKeys);
    // clicked controls give focus back, so the element keys and Space reach the game again
    root.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('button, summary') || (t instanceof HTMLInputElement && t.type === 'checkbox')) (t.closest('button, summary, input') as HTMLElement).blur();
    });
    root.addEventListener('change', (e) => { const t = e.target as HTMLElement; if (t instanceof HTMLSelectElement || (t instanceof HTMLInputElement && t.type === 'range')) t.blur(); });
    root.addEventListener('contextmenu', (e) => e.stopPropagation());

    const head = h('div', 'tune-head');
    const title = h('div', 'tune-title', 'Tuning');
    const hash = h('span', 'tune-hash');
    const flags = h('div', 'tune-flags');
    const close = h('button', 'tune-x', '×'); close.title = 'Close (F1)';
    close.addEventListener('click', () => this.toggle());
    title.appendChild(hash);
    head.append(title, close);
    root.append(head, flags);

    const meters = h('div', 'tune-meters');
    const exp = h('textarea', 'tune-io'); exp.readOnly = true; exp.rows = 4;
    const imp = h('textarea', 'tune-io'); imp.rows = 3; imp.placeholder = 'Paste a tuning: {"runes.regen": 0.5}';
    const msg = h('div', 'tune-msg');
    const pause = h('button', '', 'Pause');
    this.el = { hash, meters, export: exp, import: imp, msg, pause, flags };

    // Feel: the few knobs that matter most, pinned
    const feelIds = [...FEEL, ...ARCHETYPES.filter((a) => a.id !== 'none').map((a): [string, string] => [`enemy.${a.id}.speed`, `${a.name} speed`])];
    const feel = this.section('Feel', true, root);
    for (const [id, text] of feelIds) { const t = findTunable(id); if (t) feel.rows.push(this.row(t, feel.det, text, false)); }
    this.sections.push(feel);

    // Tools: cheats, time, spawning, waves
    const tools = this.panelSection('Tools', true, root);
    this.toolsSec = tools.parentElement!;
    for (const x of this.extra) this.placeSection(x);
    const tg = h('div', 'tune-line');
    for (const [key, label] of [['infiniteRunes', 'Infinite runes'], ['godMode', 'God mode']] as const) {
      const lab = h('label', 'tune-check'), box = h('input');
      box.type = 'checkbox';
      box.addEventListener('change', () => { this[key] = box.checked; if (box.checked) this.cheat(); });
      lab.append(box, document.createTextNode(label));
      tg.appendChild(lab); this.toggles.push({ key, box });
    }
    tools.appendChild(tg);

    const time = h('div', 'tune-line');
    time.appendChild(h('span', 'tune-k', 'Time'));
    for (const s of SCALES) {
      const b = h('button', 'seg', `${s}×`);
      b.addEventListener('click', () => { this.timeScale = s; this.renderTime(); });
      this.scaleBtns.push(b); time.appendChild(b);
    }
    pause.addEventListener('click', () => this.setPaused(!this.paused));
    const stepB = h('button', '', 'Step'); stepB.title = 'One tick (.)';
    stepB.addEventListener('click', () => this.stepOnce());
    time.append(pause, stepB);
    tools.appendChild(time);

    const sp = h('div', 'tune-line');
    const sel = h('select');
    ARCHETYPES.forEach((a, i) => { if (i === 0) return; const o = h('option', '', a.name); o.value = String(i); sel.appendChild(o); });
    sel.addEventListener('change', () => { this.arch = Number(sel.value); });
    const spawnB = h('button', '', 'Spawn at cursor'); spawnB.title = 'N while the panel is open';
    spawnB.addEventListener('click', () => this.spawn());
    sp.append(h('span', 'tune-k', 'Enemy'), sel, spawnB);
    tools.appendChild(sp);

    const wv = h('div', 'tune-line');
    const wn = h('input', 'tune-num'); wn.type = 'number'; wn.min = '1'; wn.step = '1'; wn.value = '1';
    const act = (label: string, fn: () => void, tip = '') => { const b = h('button', '', label); if (tip) b.title = tip; b.addEventListener('click', () => { fn(); this.cheat(); }); return b; };
    wv.append(h('span', 'tune-k', 'Wave'), wn,
      act('Start', () => devStartWave(this.world, Math.max(1, Number(wn.value) || 1), 2), 'Clears the field, then wave N after a 2 s lull'),
      act('Skip lull', () => devSkipLull(this.world)),
      act('Stop', () => devStopWaves(this.world), 'Stops the wave director; enemies stay'));
    tools.appendChild(wv);
    if (this.world.run) {
      // Survive: a new run, or a power-up for P1 without walking to an altar.
      const sv = h('div', 'tune-line');
      const pu = h('select');
      for (let k = 1; k < N_PU; k++) { const o = h('option', '', perkOf(k, k === PU.deepEl ? EL.fire : 0).name); o.value = String(k); pu.appendChild(o); }
      sv.append(h('span', 'tune-k', 'Survive'), act('New run', () => devRestartRun(this.world), 'Starts a new run now (Space does it on the run-over screen)'),
        pu, act('Give P1', () => grant(this.world, 0, Number(pu.value), Number(pu.value) === PU.deepEl ? EL.fire : 0), 'P1 takes this power-up now'));
      tools.appendChild(sv);
    }
    const misc = h('div', 'tune-line');
    misc.append(act('Clear enemies', () => devClearEnemies(this.world)), act('Refill runes', () => devRefillRunes(this.world, 0)), act('Heal', () => devHeal(this.world, 0)));
    tools.appendChild(misc);
    tools.appendChild(h('div', 'tune-hint', 'Keys while open: N spawn · P pause · . step · F1 close'));

    // Meters
    const ms = this.panelSection('Meters', true, root);
    const resetM = h('button', '', 'Reset meters');
    resetM.addEventListener('click', () => { this.meters.reset(); this.renderMeters(); });
    ms.append(meters, resetM);

    // Save & share
    const share = this.panelSection('Save & share', false, root);
    const copy = h('button', '', 'Copy');
    copy.addEventListener('click', () => {
      const done = () => { msg.textContent = 'Copied.'; };
      const fallback = () => { exp.focus(); exp.select(); msg.textContent = 'Selected: press Ctrl+C.'; };
      try { void navigator.clipboard.writeText(exp.value).then(done, fallback); } catch { fallback(); }
    });
    const apply = h('button', '', 'Apply');
    apply.addEventListener('click', () => {
      const p = parseOverrides(imp.value);
      if (!p.ok) { msg.textContent = p.error; return; }
      const unknown = replaceTuning(p.map);
      this.changed();
      msg.textContent = `Applied ${Object.keys(p.map).length - unknown.length} values.` + (unknown.length ? ` Unknown: ${unknown.join(', ')}` : '');
    });
    const resetAll = h('button', 'warn', 'Reset all');
    resetAll.addEventListener('click', () => { replaceTuning({}); this.changed(); msg.textContent = 'Back to the defaults.'; });
    share.append(h('div', 'tune-k', 'Export (what differs from the defaults)'), exp, copy,
      h('div', 'tune-k', 'Import (replaces the current tuning)'), imp, apply, resetAll, msg);

    // every tunable, by group, with a search box
    const search = h('input', 'tune-search'); search.type = 'search'; search.placeholder = 'Search tunables (id or label)';
    search.addEventListener('input', () => this.filter(search.value));
    root.appendChild(search);
    const byGroup = new Map<string, Section>();
    for (const t of tunables()) {
      let s = byGroup.get(t.group);
      if (!s) { s = this.section(t.group, false, root); byGroup.set(t.group, s); this.sections.push(s); }
      s.rows.push(this.row(t, s.det, t.label, true));
    }
    document.body.appendChild(root);
  }

  /** A section another part of the client fills (the Network test), placed after Tools once the panel is built. */
  addSection(label: string, fill: (body: HTMLElement) => void): void {
    this.extra.push({ label, fill });
    if (this.toolsSec) this.placeSection(this.extra[this.extra.length - 1]);
  }

  private placeSection(x: { label: string; fill: (body: HTMLElement) => void }): void {
    const holder = document.createElement('div');
    const body = this.panelSection(x.label, false, holder);
    const det = holder.firstElementChild!;
    (this.lastExtra ?? this.toolsSec!).after(det);
    this.lastExtra = det;
    x.fill(body);
  }

  private panelSection(label: string, open: boolean, parent: HTMLElement): HTMLElement {
    const det = h('details', 'tune-sec'); det.open = open;
    det.appendChild(h('summary', '', label));
    const body = h('div', 'tune-body'); det.appendChild(body);
    parent.appendChild(det);
    return body;
  }

  private section(group: string, open: boolean, parent: HTMLElement): Section {
    const det = h('details', 'tune-sec'); det.open = open;
    const sum = h('summary', '', group), count = h('span', 'tune-count');
    sum.appendChild(count); det.appendChild(sum);
    parent.appendChild(det);
    return { group, det, count, rows: [], wasOpen: open };
  }

  /** One knob: label, slider, number, reset dot. Feel rows keep the help in the tooltip, to stay short. */
  private row(t: Tunable, parent: HTMLElement, text: string, helpText: boolean): Row {
    const el = h('div', 'tune-row');
    const label = h('span', 'tune-label', text);
    label.title = `${t.id}  (default ${fmt(t.def)})${t.help ? '\n' + t.help : ''}`;
    const dot = h('button', 'tune-dot'); dot.title = `Reset to ${fmt(t.def)}`;
    const num = h('input', 'tune-num'); num.type = 'number'; num.step = String(t.step);
    const range = h('input', 'tune-range'); range.type = 'range';
    range.min = String(t.min); range.max = String(t.max); range.step = String(t.step);
    el.append(label, range, num, dot);
    if (t.help && helpText) el.appendChild(h('div', 'tune-help', t.help));
    const dec = decimals(t.step);
    range.addEventListener('input', () => this.setValue(t, Number(Number(range.value).toFixed(dec))));
    num.addEventListener('change', () => { if (num.value.trim() !== '') this.setValue(t, Number(num.value)); else this.renderRow(r); });
    dot.addEventListener('click', () => this.setValue(t, t.def));
    parent.appendChild(el);
    const r: Row = { t, el, range, num, dot };
    const list = this.rows.get(t.id) ?? [];
    list.push(r); this.rows.set(t.id, list);
    return r;
  }

  private filter(q: string): void {
    const s = q.trim().toLowerCase();
    for (const sec of this.sections) {
      let any = false;
      for (const r of sec.rows) {
        const hit = !s || r.t.id.toLowerCase().includes(s) || r.t.label.toLowerCase().includes(s);
        r.el.style.display = hit ? '' : 'none';
        any ||= hit;
      }
      sec.det.style.display = any ? '' : 'none';
      // while searching, matches show open; clearing the search restores what was open before
      if (s) { if (!sec.det.dataset.searching) { sec.wasOpen = sec.det.open; sec.det.dataset.searching = '1'; } sec.det.open = true; }
      else if (sec.det.dataset.searching) { sec.det.open = sec.wasOpen; delete sec.det.dataset.searching; }
    }
  }

  // ---- rendering ----

  private renderRow(r: Row): void {
    const v = r.t.get(), changed = v !== r.t.def;
    r.range.value = String(v);
    if (document.activeElement !== r.num) r.num.value = fmt(v);
    r.el.classList.toggle('chg', changed);
    r.dot.style.visibility = changed ? 'visible' : 'hidden';
  }

  private renderTime(): void {
    if (!this.el) return;
    this.scaleBtns.forEach((b, k) => b.classList.toggle('on', SCALES[k] === this.timeScale));
    this.el.pause.textContent = this.paused ? 'Resume' : 'Pause';
    this.el.pause.classList.toggle('on', this.paused);
    this.renderFlags();
  }

  private renderFlags(): void {
    if (!this.el) return;
    const f = this.flags().trim().split(/\s{2,}/).filter(Boolean);
    this.el.flags.innerHTML = f.map((x) => `<span>${esc(x)}</span>`).join('');
    this.el.flags.style.display = f.length ? '' : 'none';
  }

  private renderMeters(): void {
    if (!this.el) return;
    const m = this.meters, n = (v: number, d = 0) => v.toFixed(d);
    const secs = m.elapsed(), mm = Math.floor(secs / 60), ss = Math.floor(secs % 60);
    let html = `<div class="tune-stats">
      <div><b>${n(m.dps(), 1)}</b><span>DPS (3 s)</span></div>
      <div><b>${n(m.totalDamage)}</b><span>damage</span></div>
      <div><b>${n(m.totalHeal)}</b><span>healing</span></div>
      <div><b>${n(m.runesPerMinute(), 1)}</b><span>runes / min</span></div>
      <div><b>${m.totalCasts}</b><span>casts</span></div>
      <div><b>${mm}:${String(ss).padStart(2, '0')}</b><span>sim time</span></div>
    </div>`;
    const rows = m.spellRows().slice(0, 14);
    if (rows.length) {
      html += '<table class="tune-tab"><tr><th>Spell</th><th>casts</th><th>dmg</th><th>heal</th><th title="damage per rune spent">/rune</th></tr>' +
        rows.map((r) => `<tr><td title="${esc(r.title)}">${esc(r.title)}</td><td>${r.casts}</td><td>${n(r.damage)}</td><td>${r.heal ? n(r.heal) : ''}</td><td>${r.runes ? n(r.damage / r.runes, 1) : ''}</td></tr>`).join('') +
        '</table>';
    } else html += '<div class="tune-hint">Cast something: spells show up here.</div>';
    const kills = [...m.kills.values()].sort((a, b) => a.arch - b.arch);
    if (kills.length) html += '<div class="tune-k">Time to kill (first hit to death)</div><div class="tune-chips">' +
      kills.map((k) => `<span>${esc(ARCHETYPES[k.arch]?.name ?? '?')} <b>${n(k.seconds / k.kills, 1)} s</b> ×${k.kills}</span>`).join('') + '</div>';
    if (m.waves.length) html += '<div class="tune-k">Wave clear time</div><div class="tune-chips">' +
      m.waves.slice(-8).map((w) => `<span>W${w.wave} <b>${n(w.seconds, 1)} s</b></span>`).join('') + '</div>';
    this.el.meters.innerHTML = html;
  }
}

function injectStyle(): void {
  if (document.getElementById('tune-css')) return;
  const st = document.createElement('style');
  st.id = 'tune-css';
  // the HUD's dusk palette: plates #0a0810 / #141220 / #1a1726, rims #3a3450, text #e8e4f0 / #8a8498, gold #ffd860
  st.textContent = `
.tune-btn { position: fixed; right: 8px; top: 8px; z-index: 20; font: 600 11px/1 ui-monospace, Consolas, monospace; color: #e8e4f0; background: rgba(20, 18, 32, 0.85); border: 1px solid #3a3450; border-radius: 4px; padding: 5px 8px; cursor: pointer; letter-spacing: 0.04em; }
.tune-btn:hover { border-color: #ffd860; color: #ffd860; }
.tune { position: fixed; top: 0; right: 0; bottom: 0; width: 340px; max-width: calc(100vw - 24px); z-index: 20; overflow-y: auto; overscroll-behavior: contain;
  background: rgba(14, 12, 22, 0.94); border-left: 1px solid #3a3450; box-shadow: -6px 0 18px rgba(0, 0, 0, 0.45); color: #e8e4f0;
  font: 12px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 0 10px 24px; box-sizing: border-box; scrollbar-color: #3a3450 transparent; }
.tune * { box-sizing: border-box; }
.tune button, .tune select, .tune input, .tune textarea { font: inherit; color: inherit; }
.tune button { background: #1f1c2e; border: 1px solid #3e3854; border-radius: 3px; padding: 3px 7px; cursor: pointer; }
.tune button:hover { border-color: #8a8498; }
.tune button.on { background: #3a3020; border-color: #ffd860; color: #ffd860; }
.tune button.warn:hover { border-color: #ff6a6a; color: #ff6a6a; }
.tune-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; margin: 0 -10px; padding: 8px 10px; background: #141220; border-bottom: 1px solid #3a3450; }
.tune-title { font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; font-size: 11px; }
.tune-hash { margin-left: 8px; font: 11px ui-monospace, Consolas, monospace; color: #8a8498; text-transform: none; letter-spacing: 0; font-weight: 400; }
.tune-hash.on { color: #ffd860; }
.tune .tune-x { border: 0; background: none; font-size: 18px; line-height: 1; padding: 0 4px; color: #8a8498; }
.tune .tune-x:hover { color: #e8e4f0; }
.tune-flags { display: flex; gap: 4px; flex-wrap: wrap; padding: 6px 0 0; }
.tune-flags span { font: 10px ui-monospace, Consolas, monospace; color: #ffd860; border: 1px solid #5a4a24; border-radius: 3px; padding: 1px 5px; }
.tune-sec { border-bottom: 1px solid #241f34; }
.tune-sec > summary { cursor: pointer; padding: 8px 0 6px; font-weight: 600; color: #cfc9dc; list-style: none; user-select: none; display: flex; gap: 6px; align-items: baseline; }
.tune-sec > summary::-webkit-details-marker { display: none; }
.tune-sec > summary::before { content: '▸'; color: #6a6484; width: 10px; }
.tune-sec[open] > summary::before { content: '▾'; }
.tune-count { margin-left: auto; font-weight: 400; font-size: 11px; color: #ffd860; }
.tune-body { padding: 0 0 8px; display: flex; flex-direction: column; gap: 6px; }
.tune-body > button { align-self: flex-start; }
.tune-line { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.tune-k { color: #8a8498; font-size: 11px; min-width: 40px; }
.tune-hint { color: #6a6484; font-size: 11px; }
.tune-check { display: inline-flex; align-items: center; gap: 4px; margin-right: 10px; cursor: pointer; }
.tune input[type=checkbox], .tune input[type=range] { accent-color: #ffd860; }
.tune select, .tune .tune-num, .tune-search, .tune-io { background: #0a0810; border: 1px solid #3e3854; border-radius: 3px; padding: 2px 4px; }
.tune .seg { padding: 3px 6px; }
.tune-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(60px, 112px) 62px 10px; align-items: center; column-gap: 6px; padding: 2px 6px; margin: 0 -6px; border-left: 2px solid transparent; border-radius: 2px; }
.tune-row.chg { background: rgba(255, 216, 96, 0.07); border-left-color: #ffd860; }
.tune-row.chg .tune-num { color: #ffd860; border-color: #5a4a24; }
.tune-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; }
.tune .tune-num { width: 62px; font: 11px ui-monospace, Consolas, monospace; text-align: right; }
.tune .tune-dot { width: 10px; height: 10px; padding: 0; border-radius: 50%; background: #ffd860; border: 0; visibility: hidden; flex: none; }
.tune .tune-dot:hover { background: #fff; }
.tune-range { width: 100%; margin: 0; height: 14px; }
.tune-help { grid-column: 1 / -1; color: #6a6484; font-size: 10.5px; line-height: 1.3; padding-bottom: 2px; }
@media (max-width: 900px) { .tune { width: 300px; } }
.tune-search { width: 100%; margin: 10px 0 2px; padding: 5px 7px; }
.tune-io { width: 100%; resize: vertical; font: 11px ui-monospace, Consolas, monospace; }
.tune-msg { color: #8a8498; font-size: 11px; min-height: 14px; word-break: break-word; }
.tune-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.tune-stats div { background: #141220; border: 1px solid #241f34; border-radius: 3px; padding: 4px 6px; display: flex; flex-direction: column; }
.tune-stats b { font: 600 14px ui-monospace, Consolas, monospace; color: #e8e4f0; }
.tune-stats span { color: #8a8498; font-size: 10.5px; }
.tune-tab { width: 100%; border-collapse: collapse; font: 11px ui-monospace, Consolas, monospace; table-layout: fixed; }
.tune-tab th { color: #8a8498; font-weight: 400; text-align: right; padding: 2px 3px; border-bottom: 1px solid #241f34; }
.tune-tab td { text-align: right; padding: 2px 3px; white-space: nowrap; }
.tune-tab th:first-child, .tune-tab td:first-child { text-align: left; width: 42%; overflow: hidden; text-overflow: ellipsis; }
.tune-tab tr:nth-child(even) td { background: rgba(255, 255, 255, 0.025); }
.tune-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.tune-chips span { background: #141220; border: 1px solid #241f34; border-radius: 3px; padding: 2px 6px; font-size: 11px; color: #8a8498; }
.tune-chips b { color: #e8e4f0; font-weight: 600; }
`;
  document.head.appendChild(st);
}
