/**
 * The VFX Lab's side panel: runes as the HUD draws them (each element's icon and colours, its key, the HUD's two
 * staggered rows), the queue the game would make of them, the cast, the aim, the scene and the clock. Plain DOM; it
 * changes the LabState in place and calls back, and main.ts applies the change in the page and rewrites the URL.
 *
 * Keys while no text box has focus: the game's rune keys queue runes, Backspace takes the last off, Esc clears,
 * Space plays or pauses, , and . step a tick, Enter recasts.
 */
import { rules, type Element } from '@wizard-sim/rules';
import { MOODS } from '../../art/lighting';
import * as X from '../../art/px';
import { FORMS, HANDS, SPEEDS, canPress, isHands, queueOf, type LabState } from './state';
import { SCENES } from './scenes';

export interface PanelHooks {
  /** The setup changed (runes, cast, aim, scene, mood, seed, grid): rebuild the panels. */
  setup(): void;
  play(on: boolean): void;
  /** Pause and move by n ticks. */
  step(n: number): void;
  recast(): void;
  /** Pause at t. */
  scrub(t: number): void;
  speed(v: number): void;
  /** The clock now (s from the cast), whether it's playing, and the scrubber's range. */
  clock(): { t: number; playing: boolean; min: number; max: number };
}

/** The HUD's rows (hud.ts TOP and BOT): the keys under the left hand. */
const ROWS: Element[][] = [['water', 'life', 'shield', 'cold'], ['lightning', 'arcane', 'sigil', 'fire', 'earth']];

const CSS = `
#panel { width: 288px; flex: none; background: #181a20; border-right: 1px solid #2a2e38; padding: 8px 10px 16px; box-sizing: border-box;
  height: 100vh; overflow-y: auto; font: 12px system-ui, sans-serif; color: #c8ccd6; user-select: none; }
#panel h3 { margin: 12px 0 5px; font: 600 10px system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #7d8494; }
#panel h3:first-child { margin-top: 2px; }
#panel .row { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; margin-bottom: 4px; }
#panel button { font: inherit; background: #252832; color: inherit; border: 1px solid #383d4a; border-radius: 4px; padding: 3px 7px; cursor: pointer; }
#panel button:hover { border-color: #5a6274; }
#panel button.on { background: #3b3f6e; border-color: #8a90ff; color: #fff; }
#panel button:disabled { opacity: .35; cursor: default; }
#panel input, #panel select { font: inherit; background: #22252d; color: inherit; border: 1px solid #383d4a; border-radius: 4px; padding: 2px 4px; }
#panel input[type=number] { width: 56px; }
#panel input[type=range] { width: 100%; }
#panel .rune { width: 46px; height: 46px; padding: 2px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
#panel .rune img { image-rendering: pixelated; width: 21px; height: 21px; }
#panel .rune span { font: 600 10px ui-monospace, Consolas, monospace; }
#panel .stagger { padding-left: 16px; }
#panel .queue { min-height: 30px; background: #111318; border: 1px solid #2a2e38; border-radius: 4px; padding: 3px 5px; display: flex; gap: 3px; align-items: center; flex: 1; }
#panel .queue img { image-rendering: pixelated; width: 21px; height: 21px; }
#panel .queue.dim { opacity: .35; }
#panel .hint { color: #7d8494; font-size: 11px; line-height: 1.35; }
#panel .metrics { font: 11px ui-monospace, Consolas, monospace; color: #9aa2b4; white-space: pre; line-height: 1.4; }
#panel label { display: inline-flex; gap: 4px; align-items: center; }
`;

/** An element's HUD icon (px.ts), three times its size, as an image (no canvas in the page: tools capture the first one). */
const iconCache = new Map<string, string>();
function iconUrl(el: string, col: string): string {
  const key = el + col;
  let u = iconCache.get(key);
  if (!u) { const { c, x } = X.canvas(7, 7); X.icon(x, el, 0, 0, col); u = c.toDataURL(); iconCache.set(key, u); }
  return u;
}
const img = (el: string, col: string) => { const i = document.createElement('img'); i.src = iconUrl(el, col); i.alt = el; return i; };

export function mountPanel(host: HTMLElement, S: LabState, hooks: PanelHooks): { sync(): void; metrics(text: string): void; knobs: HTMLElement } {
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e;
  };
  const section = (title: string) => host.append(h('h3', { textContent: title }));
  const row = (...kids: (Node | string)[]) => { const r = h('div', { className: 'row' }, ...kids); host.append(r); return r; };
  const setup = () => { hooks.setup(); sync(); };

  // ---- runes
  section('Runes');
  const runeBtns = new Map<Element, HTMLButtonElement>();
  ROWS.forEach((els, k) => {
    const r = row(); if (k) r.classList.add('stagger');
    for (const el of els) {
      const ramp = X.EL[el], b = h('button', { className: 'rune', title: `${rules.ELEMENTS[el].name} (${rules.ELEMENTS[el].key})` }, img(el, ramp[2]), h('span', { textContent: rules.ELEMENTS[el].key }));
      b.style.borderColor = ramp[3]; (b.querySelector('span') as HTMLElement).style.color = ramp[1];
      b.onclick = () => press(el);
      b.oncontextmenu = (e) => { e.preventDefault(); unpress(); };
      runeBtns.set(el, b); r.append(b);
    }
  });
  const queue = h('div', { className: 'queue', title: 'The queue the game makes of these presses. Right-click: take the last press off.' });
  queue.oncontextmenu = (e) => { e.preventDefault(); unpress(); };
  row(queue, h('button', { textContent: 'Undo', title: 'Take the last press off (Backspace)', onclick: () => unpress() }), h('button', { textContent: 'Clear', title: 'Esc', onclick: () => { S.presses = []; setup(); } }));
  const pressLine = h('div', { className: 'hint' });
  host.append(pressLine);
  function press(el: Element): void { if (canPress(S.presses, el)) { S.presses = [...S.presses, el]; if (isHands(S.form)) S.form = 'force'; setup(); } }
  function unpress(): void { if (S.presses.length) { S.presses = S.presses.slice(0, -1); setup(); } }

  // ---- cast
  section('Cast');
  const formBtns = new Map<string, HTMLButtonElement>();
  const formRow = (forms: readonly string[]) => row(...forms.map((f) => {
    const b = h('button', { textContent: f, onclick: () => { S.form = f; setup(); } });
    formBtns.set(f, b); return b;
  }));
  formRow(FORMS);
  host.append(h('div', { className: 'hint', textContent: 'Hands (nothing queued):' }));
  formRow(HANDS);

  // ---- aim
  section('Aim (wizard 1)');
  const ang = h('input', { type: 'number', step: '5', title: 'Degrees on the ground: 0 to the right of the screen, 90 toward the camera' });
  const dist = h('input', { type: 'number', step: '0.25', min: '0', title: 'World units from the caster' });
  const aimSet = () => { const a = Number(ang.value), d = Number(dist.value); if (Number.isFinite(a) && Number.isFinite(d)) { S.aim = [a, Math.max(0, d)]; setup(); } };
  ang.onchange = aimSet; dist.onchange = aimSet;
  row(h('label', {}, 'angle', ang), h('label', {}, 'dist', dist), h('button', { textContent: 'Target', title: "Back to the scene's own target", onclick: () => { S.aim = null; setup(); } }));
  host.append(h('div', { className: 'hint', textContent: 'Drag on the stage to aim; the line shows while the pointer is over it.' }));

  // ---- scene
  section('Scene');
  const scene = h('select', { onchange: () => { S.scene = scene.value; S.aim = null; setup(); } });
  for (const k of Object.keys(SCENES)) scene.append(h('option', { value: k, textContent: k }));
  const mood = h('select', { onchange: () => { S.mood = mood.value || null; setup(); } });
  mood.append(h('option', { value: '', textContent: "scene's" }));
  for (const k of Object.keys(MOODS)) mood.append(h('option', { value: k, textContent: k }));
  row(h('label', {}, 'scene', scene), h('label', {}, 'mood', mood));
  const seed = h('input', { type: 'number', onchange: () => { S.seed = Number(seed.value) | 0; setup(); } });
  row(h('label', {}, 'seed', seed), h('button', { textContent: 'Reroll', onclick: () => { S.seed = Math.floor(Math.random() * 1e6); setup(); } }));
  const blurb = h('div', { className: 'hint' });
  host.append(blurb);

  // ---- time
  section('Time');
  const playBtn = h('button', { onclick: () => hooks.play(!hooks.clock().playing) });
  row(playBtn, h('button', { textContent: '-1', title: 'A tick back (,)', onclick: () => hooks.step(-1) }), h('button', { textContent: '+1', title: 'A tick on (.)', onclick: () => hooks.step(1) }),
    h('button', { textContent: 'Recast', title: 'From the top (Enter)', onclick: () => hooks.recast() }));
  const speedBtns = SPEEDS.map((v) => h('button', { textContent: `${v}x`, onclick: () => { hooks.speed(v); sync(); } }));
  row(...speedBtns);
  const scrub = h('input', { type: 'range', step: String(1 / 60) });
  scrub.oninput = () => hooks.scrub(Number(scrub.value));
  const tOut = h('span', { className: 'hint' });
  const loop = h('input', { type: 'number', step: '0.5', min: '0.5', title: 'Seconds after the cast before it recasts', onchange: () => { S.loop = Math.max(0.5, Number(loop.value) || 3); sync(); } });
  host.append(scrub);
  row(tOut, h('label', {}, 'loop', loop));

  // ---- grid
  section('Grid');
  const grid = h('input', { type: 'checkbox', onchange: () => { S.grid = grid.checked; setup(); } });
  const nBtns = [1, 2, 3, 4, 5].map((n) => h('button', {
    textContent: String(n), title: `${n} rune${n > 1 ? 's' : ''}`,
    onclick: () => { S.ns = S.ns.includes(n) ? S.ns.filter((x) => x !== n) : [...S.ns, n].sort((a, b) => a - b); if (!S.ns.length) S.ns = [n]; setup(); },
  }));
  row(h('label', {}, grid, 'rune grid'), ...nBtns);
  host.append(h('div', { className: 'hint', textContent: 'Each panel: the presses, then more of the first, or cut short.' }));

  // ---- knobs (knob-panel.ts mounts here when it exists)
  section('Knobs');
  const knobs = h('div', { id: 'knobs' });
  host.append(knobs);

  // ---- metrics and the link
  section('Frame');
  const metrics = h('div', { className: 'metrics' });
  host.append(metrics);
  row(h('button', { textContent: 'Copy link', onclick: () => void navigator.clipboard?.writeText(location.href) }));
  host.append(h('div', { className: 'hint', textContent: 'Keys: rune keys, Backspace, Esc, Space play/pause, , and . step, Enter recast.' }));

  addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const el = rules.BASE.find((x) => 'Key' + rules.ELEMENTS[x].key === e.code);
    if (el) { press(el); e.preventDefault(); }
    else if (e.code === 'Backspace') { unpress(); e.preventDefault(); }
    else if (e.code === 'Escape') { S.presses = []; setup(); }
    else if (e.code === 'Space') { hooks.play(!hooks.clock().playing); e.preventDefault(); }
    else if (e.code === 'Comma') hooks.step(-1);
    else if (e.code === 'Period') hooks.step(1);
    else if (e.code === 'Enter') hooks.recast();
  });

  function sync(): void {
    const q = queueOf(S.presses), hands = isHands(S.form);
    queue.replaceChildren(...(q.length ? q.map((el) => img(el, X.EL[el][2])) : [h('span', { className: 'hint', textContent: 'empty: queue runes above' })]));
    queue.classList.toggle('dim', hands);
    pressLine.textContent = hands ? 'A hands move: the queue is not used.' : `Pressed: ${S.presses.join(', ') || 'nothing'}`;
    for (const [el, b] of runeBtns) b.disabled = !canPress(S.presses, el);
    for (const [f, b] of formBtns) b.classList.toggle('on', f === S.form);
    if (document.activeElement !== ang) ang.value = S.aim ? String(Math.round(S.aim[0] * 10) / 10) : '';
    if (document.activeElement !== dist) dist.value = S.aim ? String(Math.round(S.aim[1] * 100) / 100) : '';
    ang.placeholder = 'target'; dist.placeholder = 'target';
    scene.value = SCENES[S.scene] ? S.scene : 'empty';
    mood.value = S.mood ?? '';
    seed.value = String(S.seed);
    blurb.textContent = (SCENES[S.scene] ?? SCENES.empty).blurb;
    loop.value = String(S.loop);
    grid.checked = S.grid;
    nBtns.forEach((b, k) => { b.classList.toggle('on', S.ns.includes(k + 1)); b.disabled = !S.grid; });
    speedBtns.forEach((b, k) => b.classList.toggle('on', SPEEDS[k] === S.speed));
    syncClock();
  }
  /** The clock's part, every frame. */
  function syncClock(): void {
    const c = hooks.clock();
    playBtn.textContent = c.playing ? 'Pause' : 'Play';
    playBtn.classList.toggle('on', c.playing);
    scrub.min = String(c.min); scrub.max = String(c.max);
    if (document.activeElement !== scrub) scrub.value = String(c.t);
    tOut.textContent = `t ${c.t >= 0 ? '+' : ''}${c.t.toFixed(3)} s`;
  }
  sync();
  return { sync, metrics: (text) => { metrics.textContent = text; syncClock(); }, knobs };
}
