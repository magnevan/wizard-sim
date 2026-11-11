/**
 * What the debug panels share (tune-panel.ts F2, tools-panel.ts F3, stats-panel.ts F4): a plain DOM
 * overlay on one edge, built the first time it opens, with a title bar, a close button and the
 * panels' styles; and the row of buttons at the top right (the help panel's "?" sits in it too).
 *
 * The Tune and Tools panels share the right edge, so opening one closes the other; Stats opens on
 * the left, so its numbers stay in view while you tune. While a right panel is open the button row
 * moves to its left edge.
 *
 * Input hygiene: key events from a panel's fields stop at the panel root, so typing a number never
 * queues an element (or hits the 1 / 2 room switch), and buttons drop focus after a click so Space
 * and the element keys go back to the game. Panels are siblings of the canvas, so clicks on them
 * never reach the canvas's walk / cast handlers.
 */

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A collapsible section; returns its body. */
export function panelSection(label: string, open: boolean, parent: HTMLElement): HTMLElement {
  const det = h('details', 'tune-sec'); det.open = open;
  det.appendChild(h('summary', '', label));
  const body = h('div', 'tune-body'); det.appendChild(body);
  parent.appendChild(det);
  return body;
}

let bar: HTMLDivElement | null = null;
/** The fixed row of buttons at the top right; `order` sorts them left to right. */
export function topBarAdd(btn: HTMLElement, order: number): void {
  injectStyle();
  if (!bar) { bar = h('div', 'dbg-bar'); document.body.appendChild(bar); }
  btn.style.order = String(order);
  bar.appendChild(btn);
}

const open: DebugPanel[] = [];

function layoutBar(): void {
  if (!bar) return;
  const right = open.find((p) => p.side === 'right');
  bar.style.right = right?.rootEl ? `${right.rootEl.offsetWidth + 8}px` : '';
}
addEventListener('resize', layoutBar);

export abstract class DebugPanel {
  isOpen = false;
  protected root: HTMLDivElement | null = null;
  protected titleEl: HTMLElement | null = null;
  private button: HTMLButtonElement;

  constructor(readonly side: 'left' | 'right', private key: string, private label: string, title: string, order: number) {
    injectStyle();
    this.button = h('button', 'tune-btn', label);
    this.button.title = `${title} (${key})`;
    this.button.addEventListener('click', () => { this.button.blur(); this.toggle(); });
    topBarAdd(this.button, order);
    // capture, so the key works even while a field in a panel has focus
    addEventListener('keydown', (e) => { if (e.code === key && !e.shiftKey) { e.preventDefault(); if (!e.repeat) this.toggle(); } }, true);
  }

  get rootEl(): HTMLDivElement | null { return this.root; }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen && !this.root) this.build();
    this.root!.style.display = this.isOpen ? '' : 'none';
    this.button.classList.toggle('on', this.isOpen);
    const k = open.indexOf(this);
    if (k >= 0) open.splice(k, 1);
    if (this.isOpen) {
      // one panel per edge
      for (const p of [...open]) if (p.side === this.side) p.toggle();
      open.push(this);
      this.onOpen();
    } else (document.activeElement as HTMLElement | null)?.blur?.();
    layoutBar();
  }

  /** Fills the panel the first time it opens. */
  protected abstract fill(root: HTMLDivElement): void;
  protected onOpen(): void { /* refresh what the panel shows */ }

  private build(): void {
    const root = this.root = h('div', `tune ${this.side}`);
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
    const title = this.titleEl = h('div', 'tune-title', this.label);
    const close = h('button', 'tune-x', '×'); close.title = `Close (${this.key})`;
    close.addEventListener('click', () => this.toggle());
    head.append(title, close);
    root.appendChild(head);
    this.fill(root);
    document.body.appendChild(root);
  }
}

/** Status tags under a panel's title ("tuned", "paused", "2×"). */
export function renderFlags(el: HTMLElement, flags: string): void {
  const f = flags.trim().split(/\s{2,}/).filter(Boolean);
  el.innerHTML = f.map((x) => `<span>${esc(x)}</span>`).join('');
  el.style.display = f.length ? '' : 'none';
}

function injectStyle(): void {
  if (document.getElementById('tune-css')) return;
  const st = document.createElement('style');
  st.id = 'tune-css';
  // the HUD's dusk palette: plates #0a0810 / #141220 / #1a1726, rims #3a3450, text #e8e4f0 / #8a8498, gold #ffd860
  st.textContent = `
.dbg-bar { position: fixed; right: 8px; top: 8px; z-index: 21; display: flex; gap: 4px; }
.tune-btn { font: 600 11px/1 ui-monospace, Consolas, monospace; color: #e8e4f0; background: rgba(20, 18, 32, 0.85); border: 1px solid #3a3450; border-radius: 4px; padding: 5px 8px; cursor: pointer; letter-spacing: 0.04em; }
.tune-btn:hover, .tune-btn.on { border-color: #ffd860; color: #ffd860; }
.tune { position: fixed; top: 0; bottom: 0; width: 340px; max-width: calc(100vw - 24px); z-index: 20; overflow-y: auto; overscroll-behavior: contain;
  background: rgba(14, 12, 22, 0.94); color: #e8e4f0;
  font: 12px/1.35 system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 0 10px 24px; box-sizing: border-box; scrollbar-color: #3a3450 transparent; }
.tune.right { right: 0; border-left: 1px solid #3a3450; box-shadow: -6px 0 18px rgba(0, 0, 0, 0.45); }
.tune.left { left: 0; border-right: 1px solid #3a3450; box-shadow: 6px 0 18px rgba(0, 0, 0, 0.45); width: 300px; }
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
@media (max-width: 900px) { .tune.right { width: 300px; } .tune.left { width: 260px; } }
.tune-search { width: 100%; margin: 10px 0 2px; padding: 5px 7px; }
.tune-io { width: 100%; resize: vertical; font: 11px ui-monospace, Consolas, monospace; }
.tune-msg { color: #8a8498; font-size: 11px; min-height: 14px; word-break: break-word; }
.tune-msg:empty { display: none; }
.tune-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.tune-stats div { background: #141220; border: 1px solid #241f34; border-radius: 3px; padding: 4px 6px; display: flex; flex-direction: column; min-width: 0; }
.tune-stats b { font: 600 14px ui-monospace, Consolas, monospace; color: #e8e4f0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tune-stats span { color: #8a8498; font-size: 10.5px; }
.tune-kv { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 10px; row-gap: 2px; font: 11px ui-monospace, Consolas, monospace; }
.tune-kv span { color: #8a8498; }
.tune-kv b { font-weight: 400; color: #e8e4f0; overflow-wrap: anywhere; }
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
