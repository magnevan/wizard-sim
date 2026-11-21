/**
 * F8 (or the Esc menu's "Report an issue"): file a note while playing. A one-line box opens over the game;
 * Enter opens a new GitHub issue on the game's repo, pre-filled with the note and where it happened (room,
 * checkpoint, the build's commit, the Stats panel's rows), and the frame is copied to the clipboard so
 * Ctrl+V on the issue page attaches it. Nothing goes through Claude, so it works with no usage left.
 * The backlog's rules (labels, triage) are in docs/tasks.md.
 */
import { BUILD_COMMIT, SIM_BUILD } from './build-id';

const REPO = 'https://github.com/magnevan/wizard-sim';

export interface ReportHost {
  /** The scenario's name and its #hash id. */
  where(): { name: string; id: string };
  /** The checkpoint last passed, if the room has them. */
  checkpoint(): string | undefined;
  /** The Stats panel's rows (tick, hash, room, ...). */
  rows(): [string, string][];
  /** The frame as a PNG, or null if it can't be read. */
  shot(): Promise<Blob | null>;
  /** The box opened or closed (let go of held keys). */
  onToggle(open: boolean): void;
}

export class ReportBox {
  open = false;
  private root: HTMLDivElement;
  private field: HTMLTextAreaElement;
  private status: HTMLDivElement;

  constructor(private host: ReportHost) {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:40;display:none;width:min(560px,90vw);'
      + 'background:#1a1726;border:2px solid #3c3552;box-shadow:0 0 0 2px #0a0810;padding:10px 12px;font:14px system-ui,sans-serif;color:#cfc9e6;';
    const head = document.createElement('div');
    head.textContent = 'Report an issue: what did you notice?';
    head.style.cssText = 'color:#ffd860;margin-bottom:6px;font-weight:600;';
    const field = document.createElement('textarea');
    field.rows = 2;
    field.placeholder = 'One line is enough. Shift+Enter for more lines.';
    field.style.cssText = 'width:100%;box-sizing:border-box;resize:vertical;background:#0f0d18;color:#fff;border:1px solid #3c3552;padding:6px;font:inherit;';
    const status = document.createElement('div');
    status.style.cssText = 'margin-top:6px;color:#8a8498;font-size:12px;';
    root.append(head, field, status);
    document.body.appendChild(root);
    this.root = root; this.field = field; this.status = status;

    // Capture phase on window, registered before the menu's: while the box is open no game key or menu
    // key sees a press (typing still reaches the field, which is the press's default action).
    addEventListener('keydown', (e) => {
      if (e.code === 'F8') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.toggle(); return; }
      if (!this.open) return;
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.file(); }
    }, true);
    addEventListener('keyup', (e) => { if (this.open) e.stopImmediatePropagation(); }, true);
    root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  toggle(): void { if (this.open) this.hide(); else this.show(); }

  show(): void {
    if (this.open) return;
    this.open = true;
    this.root.style.display = 'block';
    this.field.value = '';
    this.status.textContent = 'Enter: open the issue on GitHub · Esc: cancel';
    this.host.onToggle(true);
    this.copyShot();
    setTimeout(() => this.field.focus(), 0);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.style.display = 'none';
    this.field.blur();
    this.host.onToggle(false);
  }

  /** The frame as it was when the box opened, onto the clipboard (taken now, before the box covers anything). */
  private copyShot(): void {
    try {
      const blob = this.host.shot().then((b) => { if (!b) throw new Error('no frame'); return b; });
      void navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(() => { if (this.open) this.status.textContent += ' · screenshot copied: Ctrl+V on the issue page'; })
        .catch(() => { /* no clipboard (an insecure page, or refused): file without it */ });
    } catch { /* ClipboardItem missing */ }
  }

  private file(): void {
    const text = this.field.value.trim();
    if (!text) { this.status.textContent = 'Write something first (Esc to cancel).'; return; }
    const [first, ...rest] = text.split('\n');
    const title = first.length > 120 ? `${first.slice(0, 117)}...` : first;
    const w = this.host.where(), cp = this.host.checkpoint();
    const page = `${location.origin}${location.pathname}${location.search}#${w.id}`;
    const body = [
      ...(rest.length ? [rest.join('\n').trim(), ''] : first.length > 120 ? [first, ''] : []),
      '---',
      `**Where:** ${w.name} (\`#${w.id}\`)${cp ? `, checkpoint \`${cp}\` (\`?at=${cp}\`)` : ''}`,
      `**Build:** commit \`${BUILD_COMMIT}\` · sim \`${SIM_BUILD}\` · ${page}`,
      `**Filed:** ${new Date().toISOString().slice(0, 10)}, from the game`,
      '',
      '<details><summary>State</summary>',
      '',
      ...this.host.rows().map(([k, v]) => `- ${k}: ${v}`),
      '',
      '</details>',
    ].join('\n');
    const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
    const url = `${REPO}/issues/new?${[q('title', title), q('body', body), q('labels', 'inbox,from-game')].join('&')}`;
    window.open(url, '_blank', 'noopener');
    this.hide();
  }
}
