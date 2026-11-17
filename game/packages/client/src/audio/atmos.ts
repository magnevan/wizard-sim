/**
 * Music and ambience, on the dev server only, while they're chosen (2026-11-14). The candidates are free CC0 tracks kept in the
 * gitignored .reference folder (`.reference/tools/atmos.py` makes them and `library/rooms.json`: every track with its mood group,
 * a starting list per room, and defaults), so none of it is in the repo or a build.
 *
 * - The music and ambience tab of the Sound Lab (`?lab=atmos`): every track by mood, whatever room you're in, each with Play, a
 *   mark and a note (`atmos/track/<id>` in content/audio/lab-notes.json), and Use here, which picks it for the room you're
 *   standing in (`atmos/<room>/<kind>`: {pick}). Play one ambience and one music together to hear them as a pair, under the game.
 * - The dev game: each room plays its pick for each kind, else its default, else the first in its list marked Right.
 */
import type { World } from '@wizard-sim/sim';
import type { BedSlot } from './engine';
import type { GameAudio } from './game-audio';
import { loadBaseline } from './baseline';
import { labTabs, TABS_CSS } from './lab';

interface Track { kind: BedSlot; group: string; file: string; title: string; author: string; licence: string; page: string; note: string; secs: number }
interface Catalogue {
  tracks: Record<string, Track>;
  rooms: Record<string, Record<BedSlot, string[]>>;
  groups: string[];
  defaults?: Record<string, Partial<Record<BedSlot, string>>>;
}
type Notes = Record<string, { mark?: string; note?: string; level?: number; pick?: string }>;

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

/**
 * A track's review. Since 2026-11-14 one per track (`atmos/track/<id>`); before that they were per room, and the newest of those
 * still counts until the track is reviewed again.
 */
function reviewOf(n: Notes, cat: Catalogue, id: string): Notes[string] {
  const own = n[`atmos/track/${id}`];
  if (own?.mark || own?.note) return own;
  const t = cat.tracks[id];
  const old = Object.keys(cat.rooms).map((r) => n[`atmos/${r}/${t.kind}/${id}`]).filter((x) => x?.mark || x?.note);
  return old[old.length - 1] ?? own ?? {};
}
const heardIt = (n: Notes, cat: Catalogue, id: string): boolean => { const r = reviewOf(n, cat, id); return !!(r.mark || r.note?.trim()); };
/** Tracks nobody has marked or written on yet. */
const atmosLeft = (cat: Catalogue, n: Notes): number => Object.keys(cat.tracks).filter((id) => !heardIt(n, cat, id)).length;
const levelOf = (n: Notes, room: string, slot: BedSlot): number => n[`atmos/${room}/${slot}`]?.level ?? LEVEL[slot];

/** What a room plays: the user's pick, else its default, else the first in its list marked Right. */
function pickFor(cat: Catalogue, n: Notes, room: string, slot: BedSlot): string | undefined {
  return n[`atmos/${room}/${slot}`]?.pick ?? cat.defaults?.[room]?.[slot] ?? (cat.rooms[room]?.[slot] ?? []).find((t) => reviewOf(n, cat, t).mark === 'Right');
}

/** The dev game: each room plays its picks. Checks the room once a second. */
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
      const pick = pickFor(cat, n, id, slot);
      const url = pick ? `/__ref/${cat.tracks[pick].file}` : null;
      if (e.bedOf(slot) !== url) e.bed(slot, url, levelOf(n, id, slot));
    }
  }, 1000);
}

const CSS = `
#atmos{position:fixed;top:12px;right:12px;width:400px;max-height:calc(100vh - 24px);overflow:auto;z-index:50;background:#14121bf2;color:#ece6d8;
  border:1px solid #4a4257;border-radius:8px;padding:12px;font:13px/1.4 system-ui,sans-serif}
#atmos h2{margin:0 0 2px;font-size:15px}#atmos h3{margin:14px 0 4px;font-size:14px;border-top:1px solid #3a3346;padding-top:8px}
#atmos h4{margin:10px 0 2px;font-size:12px;color:#c9bfd8;text-transform:uppercase;letter-spacing:.04em}
#atmos p{margin:0 0 8px;color:#a9a1b5;font-size:12px}
#atmos .t{border-left:3px solid #4a4257;padding:4px 0 4px 8px;margin:6px 0}#atmos .t.todo{border-left-color:#e0a23a}#atmos .t.on{border-left-color:#d9772b}
#atmos .t b{display:block}#atmos small{display:block;color:#a9a1b5;font-size:11px;margin:1px 0 4px}
#atmos .row{display:flex;gap:4px;margin-bottom:4px;align-items:center}
#atmos button{flex:1;background:#2a2535;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:4px 6px;font:inherit;font-size:12px;cursor:pointer}
#atmos button:hover{background:#393246}#atmos button.on{background:#d9772b;border-color:#f0a35e;color:#1b1209;font-weight:600}
#atmos button.here{background:#2d4a33;border-color:#8fc98f}
#atmos textarea{box-sizing:border-box;width:100%;height:34px;background:#0f0d14;color:inherit;border:1px solid #4a4257;border-radius:5px;padding:4px;font:inherit;font-size:12px;resize:vertical}
#atmos input[type=range]{flex:1}#atmos .lbl{flex:0 0 auto;color:#a9a1b5;font-size:12px;min-width:110px}
#atmos .st{font-size:11px;font-weight:600;text-transform:none;letter-spacing:0}#atmos .st.todo{color:#e0a23a}#atmos .st.done{color:#8fc98f}`;

type El = (tag: string, text?: string, parent?: HTMLElement, cls?: string) => HTMLElement;

/** The music and ambience tab. Your keys stay your own: it never drives the wizard. */
export class AtmosLab {
  private cat: Catalogue | null = null;
  private notes: Notes = {};
  private room = '';
  private loaded = false;
  private root: HTMLElement | null = null;

  constructor(private audio: GameAudio) {
    void loadBaseline(audio); // the game's own sounds, as on the dev server, so the beds are heard under them
    void Promise.all([catalogue(), notes()]).then(([c, n]) => { this.cat = c; this.notes = n; this.loaded = true; this.draw(); });
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
      const style = document.createElement('style'); style.textContent = CSS + TABS_CSS;
      this.root = document.createElement('div'); this.root.id = 'atmos';
      // typing a note mustn't cast runes, and a click here mustn't cast a spell
      for (const ev of ['keydown', 'keyup']) this.root.addEventListener(ev, (e) => { if ((e.target as HTMLElement).tagName === 'TEXTAREA') e.stopPropagation(); });
      for (const ev of ['pointerdown', 'pointerup']) this.root.addEventListener(ev, (e) => e.stopPropagation());
      this.root.addEventListener('click', (e) => { if ((e.target as HTMLElement).tagName === 'BUTTON') (e.target as HTMLElement).blur(); });
      document.body.append(style, this.root);
    }
    const root = this.root, room = this.room, cat = this.cat, top = root.scrollTop;
    root.innerHTML = '';
    const el: El = (tag, text = '', parent = root, cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; parent.appendChild(n); return n; };
    el('h2', 'Music and ambience');
    if (!cat) { el('p', this.loaded ? 'The candidates are not on this machine (.reference/audio/library/rooms.json).' : 'Loading the candidates…'); return; }
    labTabs(root, 'atmos', this.notes, atmosLeft(cat, this.notes));
    el('p', 'Every track, by mood, whatever room you are in. Play one ambience and one music together to hear them as a pair, under the game; your keys still cast. Use here picks a track for the room you are standing in (change rooms with the number keys or the Esc menu). Amber: not marked or written on yet. All are free CC0 tracks (not ours), loudness-matched; "made here" ones are mixed or tinted locally.');
    const e = this.audio.engine;
    // the room you're in: what it plays, and its levels
    el('h3', `In ${room || '…'}`);
    for (const slot of SLOTS) {
      const name = slot === 'music' ? 'Music' : 'Ambience', pick = pickFor(cat, this.notes, room, slot);
      el('p', `${name} here: ${pick ? cat.tracks[pick].title : 'none yet'}`);
      const lk = `atmos/${room}/${slot}`, line = el('div', '', root, 'row');
      const lbl = el('span', `${name} level ${Math.round(levelOf(this.notes, room, slot) * 100)}%`, line, 'lbl');
      const r = el('input', '', line) as HTMLInputElement;
      r.type = 'range'; r.min = '0'; r.max = '1.5'; r.step = '0.05'; r.value = String(levelOf(this.notes, room, slot));
      r.oninput = () => { (this.notes[lk] ??= {}).level = Number(r.value); lbl.textContent = `${name} level ${Math.round(Number(r.value) * 100)}%`; e?.bedGain(slot, Number(r.value)); };
      r.onchange = () => this.save(lk);
      el('button', 'Stop', line).onclick = () => { e?.bed(slot, null, 0, 0.6); this.draw(); };
    }
    for (const slot of SLOTS) {
      el('h3', slot === 'music' ? 'Music' : 'Ambience');
      for (const g of cat.groups) {
        const ids = Object.keys(cat.tracks).filter((id) => cat.tracks[id].kind === slot && cat.tracks[id].group === g);
        if (!ids.length) continue;
        const left = ids.filter((id) => !heardIt(this.notes, cat, id)).length;
        el('span', left ? ` · ${left} to review` : ' · reviewed ✓', el('h4', g), `st ${left ? 'todo' : 'done'}`);
        for (const id of ids) this.track(root, el, cat, id, room);
      }
    }
    el('h3', 'This room overall');
    const all = (this.notes[`atmos/${room}`] ??= {});
    const ta = el('textarea', '', root) as HTMLTextAreaElement;
    ta.placeholder = 'What this place should sound like'; ta.value = all.note ?? '';
    ta.onblur = () => { if ((all.note ?? '') !== ta.value) { all.note = ta.value; this.save(`atmos/${room}`); } };
    root.scrollTop = top;
  }

  /** One track: what it is, Play, Use here, its mark and its note. */
  private track(root: HTMLElement, el: El, cat: Catalogue, id: string, room: string): void {
    const t = cat.tracks[id], key = `atmos/track/${id}`, url = `/__ref/${t.file}`, e = this.audio.engine;
    // a review left before reviews were per track is carried over the first time it's touched
    const n = (this.notes[key] ??= { ...reviewOf(this.notes, cat, id) });
    const done = !!(n.mark || n.note?.trim()), here = pickFor(cat, this.notes, room, t.kind) === id;
    const box = el('div', '', root, `t${done ? '' : ' todo'}`);
    box.classList.toggle('on', e?.bedOf(t.kind) === url);
    const title = el('b', t.title, box);
    el('span', done ? ` · ${n.mark ?? 'noted'}` : ' · to review', title, `st ${done ? 'done' : 'todo'}`);
    el('small', `${t.note} ${Math.floor(t.secs / 60)}:${String(Math.round(t.secs % 60)).padStart(2, '0')}, ${t.author}, ${t.licence}.`, box);
    const row = el('div', '', box, 'row');
    el('button', e?.bedOf(t.kind) === url ? 'Playing' : 'Play', row).onclick = () => { this.audio.engine?.bed(t.kind, url, levelOf(this.notes, room, t.kind), 1); this.draw(); };
    el('button', here ? `Used in ${room}` : 'Use here', row, here ? 'here' : '').onclick = () => {
      const pk = `atmos/${room}/${t.kind}`;
      (this.notes[pk] ??= {}).pick = id;
      this.save(pk);
      this.audio.engine?.bed(t.kind, url, levelOf(this.notes, room, t.kind), 1);
      this.draw();
    };
    const marks = el('div', '', box, 'row');
    for (const m of MARKS) {
      const b = el('button', m, marks);
      b.classList.toggle('on', n.mark === m);
      b.onclick = () => { n.mark = n.mark === m ? undefined : m; this.save(key); this.draw(); };
    }
    const ta = el('textarea', '', box) as HTMLTextAreaElement;
    ta.placeholder = 'What it feels like, and where it could go, in your own words'; ta.value = n.note ?? '';
    ta.onblur = () => { if ((n.note ?? '') !== ta.value) { n.note = ta.value; this.save(key); this.draw(); } };
  }
}
