/**
 * Concept images pinned to a map (editor.html's #concept panel): a strip of the scene's images, one shown large to
 * zoom (wheel) and pan (drag), and a click on it pins a note there for Claude (anchor.ref: the image and u, v from its
 * top left, 0 to 1). Images are added by dropping a file on the editor, pasting one, or + image; the scene server keeps
 * them in tools/kit/scenes/refs/<scene>/ (map-editor/store.ts, refOp).
 */
import type { Pin, Ref } from '../../../map-editor/store';

type Deps = {
  scene: () => string;
  call: (path: string, body?: unknown) => Promise<Record<string, unknown> | null>;
  toast: (msg: string, bad?: boolean) => void;
  pins: () => Pin[];
  selectedPin: () => string | null;
  pinAt: (ev: { clientX: number; clientY: number }, anchor: Pin['anchor']) => void;
  selectPin: (id: string) => void;
};
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Concepts {
  refs: Ref[] = [];
  cur: string | null = null;
  private s = 1; private tx = 0; private ty = 0;
  private press: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
  private readonly view = $('cv-view');
  private readonly img = $<HTMLImageElement>('cv-img');

  constructor(private d: Deps) {
    $('cv-x').onclick = () => this.toggle(false);
    $('cv-big').onclick = () => { $('concept').classList.toggle('big'); requestAnimationFrame(() => this.fit()); };
    $('cv-fit').onclick = () => this.fit();
    $('cv-add').onclick = () => $('cv-file').click();
    $<HTMLInputElement>('cv-file').onchange = (e) => { const f = (e.target as HTMLInputElement).files; if (f) this.addFiles([...f]); (e.target as HTMLInputElement).value = ''; };
    $<HTMLInputElement>('cv-title').onchange = (e) => { if (this.cur) this.d.call('refs', { name: this.d.scene(), op: 'rename', id: this.cur, title: (e.target as HTMLInputElement).value }); };
    $<HTMLInputElement>('cv-title').onkeydown = (e) => { if (e.key === 'Enter') (e.target as HTMLElement).blur(); };
    $('cv-rm').onclick = async () => { if (this.cur && (await this.d.call('refs', { name: this.d.scene(), op: 'remove', id: this.cur }))) this.d.toast('Image removed (its pins stay)'); };
    this.img.onload = () => this.fit();
    this.view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.view.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const k = Math.exp(-e.deltaY * 0.0015), s = Math.max(this.fitScale() * 0.5, Math.min(8, this.s * k));
      this.tx = mx - ((mx - this.tx) * s) / this.s; this.ty = my - ((my - this.ty) * s) / this.s; this.s = s;
      this.place();
    }, { passive: false });
    this.view.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.cur || (e.target as HTMLElement).classList.contains('cv-pin')) return;
      this.press = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, moved: false };
      this.view.setPointerCapture(e.pointerId);
    });
    this.view.addEventListener('pointermove', (e) => {
      const p = this.press; if (!p) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) { p.moved = true; this.view.classList.add('panning'); }
      if (p.moved) { this.tx = p.tx + e.clientX - p.x; this.ty = p.ty + e.clientY - p.y; this.place(); }
    });
    this.view.addEventListener('pointerup', (e) => {
      const p = this.press; this.press = null; this.view.classList.remove('panning');
      if (!p || p.moved || !this.cur) return;
      const r = this.view.getBoundingClientRect(), w = this.img.naturalWidth, h = this.img.naturalHeight;
      const u = (e.clientX - r.left - this.tx) / (this.s * w), v = (e.clientY - r.top - this.ty) / (this.s * h);
      if (u < 0 || u > 1 || v < 0 || v > 1) return;
      this.d.pinAt(e, { ref: { id: this.cur, u: Math.round(u * 1000) / 1000, v: Math.round(v * 1000) / 1000 } });
    });
    // drop or paste an image anywhere on the editor
    addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); document.body.classList.add('dropping'); } });
    addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
    addEventListener('drop', (e) => {
      document.body.classList.remove('dropping');
      const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) { e.preventDefault(); this.addFiles(files); }
    });
    addEventListener('paste', (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const files = [...(e.clipboardData?.items ?? [])].filter((i) => i.type.startsWith('image/')).map((i) => i.getAsFile()).filter((f): f is File => !!f);
      if (files.length) { e.preventDefault(); this.addFiles(files); }
    });
  }

  get isOpen() { return $('concept').classList.contains('open'); }
  toggle(on = !this.isOpen) { $('concept').classList.toggle('open', on); if (on) { this.render(); requestAnimationFrame(() => this.fit()); } }

  async load() { const r = await this.d.call(`refs?name=${this.d.scene()}`); this.set((r?.refs as Ref[]) ?? []); }
  set(refs: Ref[]) {
    this.refs = refs;
    if (!refs.some((r) => r.id === this.cur)) this.cur = refs[refs.length - 1]?.id ?? null;
    this.render(true);
  }

  /** Show image id (opening the panel), optionally centred on a point of it. */
  show(id: string, at?: { u: number; v: number }) {
    const changed = id !== this.cur;
    this.cur = id; this.toggle(true); this.render(changed);
    if (at) {
      const go = () => {
        const r = this.view.getBoundingClientRect(), s = Math.max(this.s, this.fitScale() * 2);
        this.s = s; this.tx = r.width / 2 - at.u * this.img.naturalWidth * s; this.ty = r.height / 2 - at.v * this.img.naturalHeight * s; this.place();
      };
      if (this.img.complete && !changed) go(); else this.img.addEventListener('load', () => requestAnimationFrame(go), { once: true });
    }
  }

  private async addFiles(files: File[]) {
    for (const f of files) {
      const data = await new Promise<string>((ok) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(f); });
      const title = f.name && f.name !== 'image.png' ? f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') : 'a pasted concept';
      const r = await this.d.call('refs', { name: this.d.scene(), op: 'add', title, data });
      const ref = r?.ref as Ref | undefined;
      if (ref) { this.d.toast(`Added “${ref.title}”: click on it to pin a note for Claude`); this.refs = [...this.refs.filter((x) => x.id !== ref.id), ref]; this.show(ref.id); }
    }
  }

  private url(r: Ref) { return `/__map/ref-image?name=${encodeURIComponent(this.d.scene())}&id=${r.id}&f=${encodeURIComponent(r.file)}`; }
  private fitScale() { const r = this.view.getBoundingClientRect(); return this.img.naturalWidth ? Math.min(r.width / this.img.naturalWidth, r.height / this.img.naturalHeight) : 1; }
  fit() {
    if (!this.img.naturalWidth) return;
    const r = this.view.getBoundingClientRect(), s = this.fitScale();
    this.s = s; this.tx = (r.width - this.img.naturalWidth * s) / 2; this.ty = (r.height - this.img.naturalHeight * s) / 2;
    this.place();
  }
  private place() {
    this.img.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
    this.renderPins();
  }

  /** The strip, the image and its pins; reload the image only when it changed. */
  render(reload = false) {
    const ref = this.refs.find((r) => r.id === this.cur);
    $('cv-tabs').innerHTML = this.refs.map((r) => `<button data-r="${r.id}" class="${r.id === this.cur ? 'on' : ''}" title="${esc(r.title)} (${r.id})"><img src="${this.url(r)}" alt=""></button>`).join('');
    $('cv-tabs').querySelectorAll<HTMLElement>('[data-r]').forEach((b) => { b.onclick = () => this.show(b.dataset.r!); });
    $('cv-empty').style.display = ref ? 'none' : 'grid';
    this.img.style.display = ref ? 'block' : 'none';
    const t = $<HTMLInputElement>('cv-title');
    if (document.activeElement !== t) t.value = ref?.title ?? '';
    t.disabled = !ref; ($('cv-rm') as HTMLButtonElement).disabled = !ref;
    if (ref && (reload || !this.img.src.includes(`id=${ref.id}&`))) this.img.src = this.url(ref);
    this.renderPins();
  }
  renderPins() {
    const w = this.img.naturalWidth, h = this.img.naturalHeight, sel = this.d.selectedPin();
    const mine = this.d.pins().filter((p) => p.anchor.ref?.id === this.cur && (p.status === 'open' || p.id === sel));
    $('cv-pins').innerHTML = !w ? '' : mine.map((p) => `<div class="cv-pin ${p.id === sel ? 'sel' : ''} ${p.status !== 'open' ? 'done' : ''}" data-pin="${p.id}" title="${esc(p.note)}"
      style="left:${this.tx + p.anchor.ref!.u * w * this.s}px;top:${this.ty + p.anchor.ref!.v * h * this.s}px">${esc(p.id.replace('p', ''))}</div>`).join('');
    $('cv-pins').querySelectorAll<HTMLElement>('[data-pin]').forEach((el) => { el.onclick = () => this.d.selectPin(el.dataset.pin!); });
  }
  title(id: string) { return this.refs.find((r) => r.id === id)?.title; }
}
