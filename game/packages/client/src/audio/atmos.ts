/**
 * Music and ambience, on the dev server only, while they're chosen (2026-11-14). The candidates are free CC0 tracks kept in the
 * gitignored .reference folder (`.reference/tools/atmos.py` makes them and `library/rooms.json`, a list per room), so none of it
 * is in the repo or a build.
 *
 * - The Atmosphere Lab (`?lab=atmos`, then go to a room with the number keys or the Esc menu): the room's candidates, each with
 *   Play, a mark and a note, kept in content/audio/lab-notes.json as `atmos/<room>/<kind>/<id>`. Play one ambience and one music
 *   together to hear them as a pair, under the game.
 * - The dev game: in each room, the first candidate marked Right for each kind plays, at the levels set in the Lab.
 */
import type { World } from '@wizard-sim/sim';
import type { BedSlot } from './engine';
import type { GameAudio } from './game-audio';
import { loadBaseline } from './baseline';

interface Track { kind: BedSlot; file: string; title: string; author: string; licence: string; page: string; note: string; secs: number }
interface Catalogue { tracks: Record<string, Track>; rooms: Record<string, Record<BedSlot, string[]>> }
type Notes = Record<string, { mark?: string; note?: string; level?: number }>;

const SLOTS: readonly BedSlot[] = ['ambience', 'music'];
const MARKS = ['Right', 'Close', 'Wrong'];
/** How loud each kind sits under the game by default: ambience well under the spells, music under them too. */
const LEVEL: Record<BedSlot, number> = { ambience: 0.7, music: 0.55 };

async function catalogue(): Promise<Catalogue | null> {
  try { const r = await fetch('/__ref/library/rooms.json'); return r.ok ? await r.json() as Catalogue : null; } catch { return null; }
}
async function notes(): Promise<Notes> {
  try { return await (await fetch('/__lab/notes')).json() as Notes; } catch { return {}; }
}
const levelOf = (n: Notes, room: string, slot: BedSlot): number => n[`atmos/${room}/${slot}`]?.level ?? LEVEL[slot];

/** The dev game: each room plays what's marked Right for it. Checks the room once a second. */
export async function roomBeds(audio: GameAudio, room: () => string): Promise<void> {
  const cat = await catalogue();
  if (!cat) return;
  const n = await notes();
  let was = '';
  setInterval(() => {
    const e = audio.engine, id = room().toLowerCase();
    if (!e || id === was) return;
    was = id;
    for (const slot of SLOTS) {
      const pick = (cat.rooms[id]?.[slot] ?? []).find((t) => n[`atmos/${id}/${slot}/${t}`]?.mark === 'Right');
      const url = pick ? `/__ref/${cat.tracks[pick].file}` : null;
      if (e.bedOf(slot) !== url) e.bed(slot, url, levelOf(n, id, slot));
    }
  }, 1000);
}

const CSS = `
#atmos{position:fixed;top:12px;right:12px;width:380px;max-height:calc(100vh - 24px);overflow:auto;z-index:50;background:#14121bf2;color:#ece6d8;
  border:1px solid #4a4257;border-radius:8px;padding:12px;font:13px/1.4 system-ui,sans-serif}
#atmos h2{margin:0 0 2px;font-size:15px}#atmos h3{margin:12px 0 4px;font-size:13px;border-top:1px solid #3a3346;padding-top:8px}
#atmos p{margin:0 0 8px;color:#a9a1b5;font-size:12px}
#atmos .t{border-left:3px solid #4a4257;padding:4px 0 4px 8px;margin:6px 0}#atmos .t.on{border-left-color:#d9772b}
#atmos .t b{display:block}#atmos small{display:block;color:#a9a1b5;font-size:11px;margin:1px 0 4px}
#atmos .row{display:flex;gap:4px;margin-bottom:4px;align-items:center}
#atmos button{flex:1;background:#2a2535;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:4px 6px;font:inherit;font-size:12px;cursor:pointer}
#atmos button:hover{background:#393246}#atmos button.on{background:#d9772b;border-color:#f0a35e;color:#1b1209;font-weight:600}
#atmos textarea{box-sizing:border-box;width:100%;height:34px;background:#0f0d14;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:4px;font:inherit;font-size:12px;resize:vertical}
#atmos input[type=range]{flex:1}#atmos .lbl{flex:0 0 auto;color:#a9a1b5;font-size:12px;min-width:110px}`;

/** The Atmosphere Lab. Your keys stay your own: it never drives the wizard. */
export class AtmosLab {
  private cat: Catalogue | null = null;
  private notes: Notes = {};
  private room = '';
  private root: HTMLElement | null = null;

  constructor(private audio: GameAudio) {
    void loadBaseline(audio); // the game's own sounds, as on the dev server, so the beds are heard under them
    void Promise.all([catalogue(), notes()]).then(([c, n]) => { this.cat = c; this.notes = n; this.draw(); });
  }

  input(w: World): null {
    const id = w.def.id.toLowerCase();
    if (id !== this.room) { this.room = id; this.draw(); }
    return null;
  }

  private save(key: string): void {
    void fetch('/__lab/notes', { method: 'POST', body: JSON.stringify({ id: key, ...this.notes[key] }) }).catch(() => undefined);
  }

  private draw(): void {
    if (!this.root) {
      const style = document.createElement('style'); style.textContent = CSS;
      this.root = document.createElement('div'); this.root.id = 'atmos';
      // typing a note mustn't cast runes, and a click here mustn't cast a spell
      for (const ev of ['keydown', 'keyup']) this.root.addEventListener(ev, (e) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA') e.stopPropagation(); });
      for (const ev of ['pointerdown', 'pointerup']) this.root.addEventListener(ev, (e) => e.stopPropagation());
      this.root.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') (e.target as HTMLElement).blur(); });
      document.body.append(style, this.root);
    }
    const root = this.root, room = this.room, cat = this.cat;
    root.innerHTML = '';
    const el = (tag: string, text = '', parent: HTMLElement = root, cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; parent.appendChild(n); return n; };
    el('h2', `Atmosphere Lab: ${room || '…'}`);
    el('p', 'Music and ambience for the room you are in. Change rooms with the number keys or the Esc menu. Play one ambience and one music together to hear them as a pair, under the game; your keys still cast. Mark Right on the one you want: the dev game then plays it in this room. All are free CC0 tracks (not ours), loudness-matched; "made here" ones are mixed or tinted locally.');
    if (!cat) { el('p', 'The candidates are not on this machine (.reference/audio/library/rooms.json).'); return; }
    const list = cat.rooms[room];
    if (!list) { el('p', `No candidates for this room yet. Rooms with some: ${Object.keys(cat.rooms).join(', ')}.`); return; }
    const e = this.audio.engine;
    for (const slot of SLOTS) {
      el('h3', slot === 'music' ? 'Music' : 'Ambience');
      // its level under the game, saved per room
      const lk = `atmos/${room}/${slot}`, line = el('div', '', root, 'row');
      el('span', `Level ${Math.round(levelOf(this.notes, room, slot) * 100)}%`, line, 'lbl');
      const r = el('input', '', line) as HTMLInputElement;
      r.type = 'range'; r.min = '0'; r.max = '1.5'; r.step = '0.05'; r.value = String(levelOf(this.notes, room, slot));
      r.oninput = () => { (this.notes[lk] ??= {}).level = Number(r.value); (line.firstChild as HTMLElement).textContent = `Level ${Math.round(Number(r.value) * 100)}%`; e?.bedGain(slot, Number(r.value)); };
      r.onchange = () => this.save(lk);
      const stop = el('button', `Stop the ${slot}`, el('div', '', root, 'row'));
      stop.onclick = () => { e?.bed(slot, null, 0, 0.6); this.draw(); };
      for (const id of list[slot]) {
        const t = cat.tracks[id], key = `${lk}/${id}`, n = (this.notes[key] ??= {}), url = `/__ref/${t.file}`;
        const box = el('div', '', root, 't');
        box.classList.toggle('on', e?.bedOf(slot) === url);
        el('b', t.title, box);
        el('small', `${t.note} ${Math.floor(t.secs / 60)}:${String(Math.round(t.secs % 60)).padStart(2, '0')}, ${t.author}, ${t.licence}.`, box);
        const row = el('div', '', box, 'row');
        const play = el('button', e?.bedOf(slot) === url ? 'Playing' : 'Play', row);
        play.onclick = () => { this.audio.engine?.bed(slot, url, levelOf(this.notes, room, slot), 1); this.draw(); };
        for (const m of MARKS) {
          const b = el('button', m, row);
          b.classList.toggle('on', n.mark === m);
          b.onclick = () => { n.mark = n.mark === m ? undefined : m; this.save(key); this.draw(); };
        }
        const ta = el('textarea', '', box) as HTMLTextAreaElement;
        ta.placeholder = 'What it feels like here, in your own words'; ta.value = n.note ?? '';
        ta.onblur = () => { if ((n.note ?? '') !== ta.value) { n.note = ta.value; this.save(key); } };
      }
    }
    el('h3', 'This room overall');
    const all = (this.notes[`atmos/${room}`] ??= {});
    const ta = el('textarea', '', root) as HTMLTextAreaElement;
    ta.placeholder = 'What this place should sound like'; ta.value = all.note ?? '';
    ta.onblur = () => { if ((all.note ?? '') !== ta.value) { all.note = ta.value; this.save(`atmos/${room}`); } };
  }
}
