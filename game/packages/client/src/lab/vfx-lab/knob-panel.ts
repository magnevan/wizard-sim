/**
 * The VFX knob panel (dev pages only): a slider and a number box for every knob (art/fx-knobs.ts), grouped by id
 * prefix, so an effect can be tuned by hand and watched live.
 *
 * - A dot marks a knob that differs from the code's default; × puts it back (per knob, or per group).
 * - Edits not yet saved are kept in localStorage, so a reload doesn't lose them; the header says how many.
 * - Save posts the overrides to the dev server (`/__fx/knobs`, vite.config.ts), which writes art/fx-knobs.json:
 *   commit that file and the game draws with the new values. Copy JSON puts the same text on the clipboard.
 *
 * Mount it into any element: `mountKnobPanel(host, redraw)`; `onChange` runs after every change of value.
 */
import { allKnobs, knobOverrides, onKnobChange, resetKnob, savedValue, setKnob, setSavedKnobs, unsavedKnobs, type Knob } from '../../art/fx-knobs';
import { parseKnobValues } from '../../art/fx-knobs-check';

const LS = 'fxKnobs.unsaved';
const STYLE_ID = 'fx-knob-style';
const CSS = `
.fxk { font: 11px/1.3 system-ui, sans-serif; color: #c8ccd6; background: #181a20; border: 1px solid #2c3039; border-radius: 4px; padding: 6px; box-sizing: border-box; min-width: 260px; }
.fxk * { box-sizing: border-box; }
.fxk-top { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-bottom: 4px; }
.fxk-top b { font-size: 12px; margin-right: auto; }
.fxk input[type=search] { flex: 1 1 100%; background: #0f1115; color: inherit; border: 1px solid #2c3039; border-radius: 3px; padding: 2px 5px; font: inherit; }
.fxk button { background: #262a33; color: inherit; border: 1px solid #353a45; border-radius: 3px; padding: 1px 6px; font: inherit; cursor: pointer; }
.fxk button:hover { background: #313643; }
.fxk button.fxk-save { background: #2d4a35; border-color: #3e6a4a; }
.fxk-state { font-size: 10px; color: #7d8494; }
.fxk-state.dirty { color: #f0c060; }
.fxk details { border-top: 1px solid #262a31; padding: 2px 0; }
.fxk summary { cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 2px 0; color: #e0e4ec; }
.fxk summary span { margin-right: auto; }
.fxk summary em { font-style: normal; color: #f0c060; font-size: 10px; }
.fxk-row { display: grid; grid-template-columns: 8px 92px 1fr 52px 16px; gap: 4px; align-items: center; padding: 1px 0; }
.fxk-row label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: help; }
.fxk-dot { width: 6px; height: 6px; border-radius: 50%; }
.fxk-dot.on { background: #f0c060; }
.fxk-row input[type=range] { width: 100%; margin: 0; accent-color: #8ab0e0; }
.fxk-row input[type=number] { width: 100%; background: #0f1115; color: inherit; border: 1px solid #2c3039; border-radius: 3px; padding: 0 2px; font: inherit; }
.fxk-row button { padding: 0; width: 16px; line-height: 14px; }
.fxk-msg { font-size: 10px; color: #7d8494; min-height: 13px; }
`;

const lsGet = (): unknown => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}'); } catch { return {}; } };
const lsSet = (v: Record<string, number>): void => {
  try { if (Object.keys(v).length) localStorage.setItem(LS, JSON.stringify(v)); else localStorage.removeItem(LS); } catch { /* blocked storage: edits last until a reload */ }
};
const groupOf = (id: string): string => id.slice(0, id.lastIndexOf('.'));
const nameOf = (id: string): string => id.slice(id.lastIndexOf('.') + 1);
const fmt = (v: number): string => String(+v.toFixed(4));
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
};

/** Restores the unsaved edits kept in localStorage (once per page, whichever panel mounts first). */
let restored = false;
function restoreUnsaved(): void {
  if (restored) return;
  restored = true;
  for (const [id, v] of Object.entries(parseKnobValues(lsGet()).values)) setKnob(id, v);
}

export function mountKnobPanel(host: HTMLElement, onChange: () => void): void {
  if (!document.getElementById(STYLE_ID)) document.head.append(el('style', { id: STYLE_ID, textContent: CSS }));
  restoreUnsaved();
  const root = el('div', { className: 'fxk' });
  const state = el('span', { className: 'fxk-state' });
  const msg = el('div', { className: 'fxk-msg' });
  const filter = el('input', { type: 'search', placeholder: 'filter knobs (e.g. fire, size)' });
  const say = (s: string): void => { msg.textContent = s; };

  const save = el('button', { className: 'fxk-save', textContent: 'Save', title: 'write the changed values to art/fx-knobs.json (dev server)' });
  save.onclick = async () => {
    const body = knobOverrides();
    try {
      const r = await fetch('/__fx/knobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const res = await r.json() as { ok?: boolean; errors?: string[] };
      if (!r.ok || !res.ok) { say('not saved: ' + (res.errors ?? [r.statusText]).join('; ')); return; }
      setSavedKnobs(body);
      say(`saved ${Object.keys(body).length} value(s) to fx-knobs.json`);
    } catch (e) { say('not saved (is this the dev server?): ' + String(e)); }
  };
  const copy = el('button', { textContent: 'Copy JSON', title: 'the values that differ from the code, as fx-knobs.json would hold them' });
  copy.onclick = async () => {
    const text = JSON.stringify(knobOverrides(), null, 2);
    try { await navigator.clipboard.writeText(text); say('copied'); } catch { say(text); }
  };
  const revert = el('button', { textContent: 'Revert', title: 'drop unsaved edits: back to fx-knobs.json' });
  revert.onclick = () => { for (const k of allKnobs()) setKnob(k.id, savedValue(k)); say('reverted to the saved values'); };
  root.append(el('div', { className: 'fxk-top' }, el('b', { textContent: 'VFX knobs' }), state, save, copy, revert, filter), msg);

  type Row = { k: Knob; row: HTMLElement; dot: HTMLElement; range: HTMLInputElement; num: HTMLInputElement };
  const rows: Row[] = [];
  const groups = new Map<string, { box: HTMLDetailsElement; count: HTMLElement; rows: Row[] }>();
  for (const k of allKnobs()) {
    const gname = groupOf(k.id);
    let grp = groups.get(gname);
    if (!grp) {
      const count = el('em'), reset = el('button', { textContent: '×', title: 'reset this group to the code' });
      const box = el('details', { open: true }, el('summary', {}, el('span', { textContent: gname }), count, reset));
      const g = { box, count, rows: [] as Row[] };
      reset.onclick = (e) => { e.preventDefault(); for (const r of g.rows) resetKnob(r.k.id); };
      groups.set(gname, g); root.append(box); grp = g;
    }
    const tip = `${k.id}\n${k.help}\ndefault ${fmt(k.dflt)} · range ${fmt(k.min)} to ${fmt(k.max)}`;
    const range = el('input', { type: 'range', min: String(k.min), max: String(k.max), step: String(k.step) });
    const num = el('input', { type: 'number', step: String(k.step) });
    const dot = el('span', { className: 'fxk-dot' });
    const x = el('button', { textContent: '×', title: 'reset to the code: ' + fmt(k.dflt) });
    range.oninput = () => setKnob(k.id, Number(range.value));
    num.oninput = () => { const v = Number(num.value); if (num.value !== '' && Number.isFinite(v)) setKnob(k.id, v); };
    num.onblur = () => { num.value = fmt(k.v); };
    x.onclick = () => resetKnob(k.id);
    const row = el('div', { className: 'fxk-row' }, dot, el('label', { textContent: nameOf(k.id), title: tip }), range, num, x);
    const r = { k, row, dot, range, num };
    rows.push(r); grp.rows.push(r); grp.box.append(row);
  }
  if (!rows.length) root.append(el('div', { className: 'fxk-msg', textContent: 'no knobs declared on this page' }));

  const show = (r: Row): void => {
    r.range.value = String(r.k.v);
    if (document.activeElement !== r.num) r.num.value = fmt(r.k.v);
    r.dot.className = 'fxk-dot' + (r.k.v !== r.k.dflt ? ' on' : '');
    r.dot.title = r.k.v !== r.k.dflt ? 'changed from the code (' + fmt(r.k.dflt) + ')' : '';
  };
  const refresh = (): void => {
    for (const g of groups.values()) {
      const n = g.rows.filter((r) => r.k.v !== r.k.dflt).length;
      g.count.textContent = n ? `${n} changed` : '';
    }
    const unsaved = unsavedKnobs(), n = Object.keys(unsaved).length;
    state.textContent = n ? `${n} unsaved` : 'saved';
    state.className = 'fxk-state' + (n ? ' dirty' : '');
    lsSet(unsaved);
  };
  filter.oninput = () => {
    const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean);
    for (const g of groups.values()) {
      let any = false;
      for (const r of g.rows) {
        const hay = (r.k.id + ' ' + r.k.help).toLowerCase(), hit = words.every((w) => hay.includes(w));
        r.row.style.display = hit ? '' : 'none'; any ||= hit;
      }
      g.box.style.display = any ? '' : 'none';
      if (words.length && any) g.box.open = true;
    }
  };

  for (const r of rows) show(r);
  refresh();
  onKnobChange((k) => {
    for (const r of rows) if (!k || r.k === k) show(r);
    refresh();
    onChange();
  });
  host.append(root);
  // for headless tools and the console: window.fxKnobs.set('spray.fire.flameSize', 1.5)
  (window as unknown as { fxKnobs: object }).fxKnobs = { all: allKnobs, set: setKnob, reset: resetKnob, overrides: knobOverrides };
}
