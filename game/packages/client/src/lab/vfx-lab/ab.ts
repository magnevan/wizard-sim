/**
 * The VFX Lab's A/B: pin the knob values as they are now as A, keep tuning (that's B), and compare the same frame with
 * each. Side by side, the stage shows the setup twice, A's panels above B's; flip shows one stage and X switches which
 * values it's drawn with, for changes too small to see apart. The knobs are global, so a panel's draw puts its
 * variant's values in place and back (fx-knobs.ts withKnobs); each side's panels have views of their own.
 *
 * A is kept in this browser's storage. A page driven by a tool (navigator.webdriver) neither reads nor shows it, so a
 * capture draws with the saved knobs only, as without the panel.
 */
import { allKnobs, knobValues, setKnob } from '../../art/fx-knobs';

export type AbMode = 'off' | 'side' | 'flip';
const LS = 'vfxLab.knobA';
const automated = typeof navigator !== 'undefined' && navigator.webdriver;

function load(): Record<string, number> | null {
  if (automated) return null;
  try { const v = JSON.parse(localStorage.getItem(LS) ?? 'null'); return v && typeof v === 'object' ? v as Record<string, number> : null; } catch { return null; }
}
function store(v: Record<string, number> | null): void {
  try { if (v) localStorage.setItem(LS, JSON.stringify(v)); else localStorage.removeItem(LS); } catch { /* blocked storage: A lasts until a reload */ }
}

export const AB = {
  /** The pinned values, or null. */
  a: load(),
  mode: 'off' as AbMode,
  /** Flip: drawing with A (else B, the live values). */
  showA: false,
  /** The mode in effect: nothing to compare without an A. */
  get on(): AbMode { return this.a ? this.mode : 'off'; },
};

const fmt = (v: number): string => String(+v.toFixed(4));
/** The knobs whose A and live values differ: [id, A, B]. */
export function abDiff(): [string, number, number][] {
  if (!AB.a) return [];
  return allKnobs().filter((k) => AB.a![k.id] !== undefined && AB.a![k.id] !== k.v).map((k) => [k.id, AB.a![k.id], k.v]);
}

export interface AbHooks {
  /** The mode changed: the stage is laid out again. */
  layout(): void;
  /** A or the flip changed: draw the frame again. */
  redraw(): void;
}

/** The A/B block (above the knob sliders). Returns sync(), for when the live knobs change. */
export function mountAB(host: HTMLElement, hooks: AbHooks): () => void {
  const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
    const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e;
  };
  const box = h('div', { className: 'ab' });
  const row = (...kids: (Node | string)[]) => { const r = h('div', { className: 'row' }, ...kids); box.append(r); return r; };
  const modeBtns = (['off', 'side', 'flip'] as AbMode[]).map((m) => h('button', {
    textContent: m === 'off' ? 'Off' : m === 'side' ? 'Side by side' : 'Flip (X)',
    onclick: () => { AB.mode = m; AB.showA = false; hooks.layout(); sync(); },
  }));
  const pin = h('button', { textContent: 'Pin as A', title: 'Keep the knob values as they are now as A; go on tuning (B)', onclick: () => { AB.a = knobValues(); store(AB.a); if (AB.mode === 'off') AB.mode = 'side'; hooks.layout(); sync(); } });
  const swap = h('button', { textContent: 'Swap', title: 'A becomes the live values, and the live ones A', onclick: () => {
    const live = knobValues(), a = AB.a!;
    AB.a = live; store(live);
    for (const [id, v] of Object.entries(a)) setKnob(id, v);
    hooks.redraw(); sync();
  } });
  const keep = h('button', { textContent: 'Keep A', title: "Load A into the live values (and drop the pin)", onclick: () => {
    const a = AB.a!;
    AB.a = null; store(null); AB.mode = 'off';
    for (const [id, v] of Object.entries(a)) setKnob(id, v);
    hooks.layout(); sync();
  } });
  const clear = h('button', { textContent: 'Clear A', onclick: () => { AB.a = null; store(null); AB.mode = 'off'; hooks.layout(); sync(); } });
  const copy = h('button', { textContent: 'Copy A/B JSON', onclick: () => {
    const text = JSON.stringify({ A: AB.a, B: knobValues(), differ: Object.fromEntries(abDiff().map(([id, a, b]) => [id, { A: a, B: b }])) }, null, 2);
    void navigator.clipboard?.writeText(text);
  } });
  row(pin, swap, keep, clear);
  row(...modeBtns);
  const flipNote = h('div', { className: 'hint' });
  box.append(flipNote);
  const diff = h('div', { className: 'abdiff' });
  box.append(diff);
  row(copy);
  host.append(box);

  addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'KeyX' && AB.on === 'flip') { AB.showA = !AB.showA; hooks.redraw(); sync(); }
  });

  function sync(): void {
    const has = !!AB.a;
    swap.disabled = keep.disabled = clear.disabled = copy.disabled = !has;
    modeBtns.forEach((b, k) => { b.disabled = !has && k > 0; b.classList.toggle('on', AB.on === (['off', 'side', 'flip'] as AbMode[])[k]); });
    flipNote.textContent = !has ? (automated ? 'A/B is off in a page driven by a tool.' : 'Pin the values you have as A, then tune: the live values are B.')
      : AB.on === 'flip' ? `Showing ${AB.showA ? 'A (pinned)' : 'B (live)'}: X flips.` : AB.on === 'side' ? 'A above, B below.' : '';
    const d = abDiff();
    diff.replaceChildren(...(has ? (d.length
      ? [h('div', { className: 'abhead' }, h('span', { textContent: 'knob' }), h('span', { textContent: 'A' }), h('span', { textContent: 'B' })),
        ...d.map(([id, a, b]) => h('div', { className: 'abrow', title: id }, h('span', { textContent: id }), h('span', { textContent: fmt(a) }), h('span', { textContent: fmt(b) })))]
      : [h('div', { className: 'hint', textContent: 'A and B are the same: change a knob.' })]) : []));
  }
  sync();
  return sync;
}

export const AB_CSS = `
#panel .ab { margin-bottom: 6px; }
#panel .abdiff { font: 11px ui-monospace, Consolas, monospace; margin: 4px 0; }
#panel .abhead, #panel .abrow { display: grid; grid-template-columns: 1fr 52px 52px; gap: 4px; }
#panel .abhead { color: #7d8494; }
#panel .abrow span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#panel .abrow span:nth-child(2) { color: #8ad0ff; }
#panel .abrow span:nth-child(3) { color: #f0c060; }
`;
