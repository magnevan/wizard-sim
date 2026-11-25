/**
 * The map editor's stone layer: after a scene compiles, its road and paving are laid stone by stone again in the
 * background (tools/kit/stones_worker.py, a long-lived process of its own so an edit never waits for it), and the open
 * pages are told to reload them (map:stones). Edits are gathered for a moment first, and only the newest compile of a
 * scene is laid; tess_layout re-lays only the pieces an edit touched, so this takes a second or two, not the whole court's 18.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import type { Compiled } from './compile-worker';

type Done = { path: string | null; laid: number; kept: number; ms: number };

export class StoneLayer {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = '';
  private stderr = '';
  private pending = new Map<string, Compiled>();   // the newest compile of each scene, not yet laid
  private timers = new Map<string, NodeJS.Timeout>();
  private busy: { id: number; name: string; ok: (d: Done) => void; fail: (e: Error) => void } | null = null;
  private next = 1;

  constructor(private kitDir: string, private onLaid: (name: string, d: Done) => void, private python = process.env.PYTHON ?? 'python', private settle = 600) {}

  /** A scene compiled: lay it once edits pause. */
  compiled(name: string, c: Compiled) {
    if (!c.floors.length) return;
    this.pending.set(name, c);
    clearTimeout(this.timers.get(name));
    this.timers.set(name, setTimeout(() => this.pump(), this.settle));
  }

  private start() {
    const p = spawn(this.python, ['-u', join(this.kitDir, 'stones_worker.py')], { stdio: 'pipe' });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d: string) => {
      this.buf += d;
      let nl;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl); this.buf = this.buf.slice(nl + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as Done & { id: number; error?: string };
        const b = this.busy; if (!b || b.id !== msg.id) continue;
        this.busy = null;
        if (msg.error) b.fail(new Error(msg.error)); else b.ok(msg);
      }
    });
    p.stderr.on('data', (d) => { this.stderr = (this.stderr + d).slice(-4000); });
    p.on('exit', () => {
      if (this.proc === p) this.proc = null;
      const b = this.busy; this.busy = null; this.buf = '';
      b?.fail(new Error(`the stone worker stopped: ${this.stderr.trim() || 'no output'}`));
    });
    p.on('error', (e) => { const b = this.busy; this.busy = null; b?.fail(e); });
    this.proc = p;
  }

  /** Lay the next waiting scene, one at a time. */
  private pump() {
    if (this.busy) return;
    const [name, c] = this.pending.entries().next().value ?? [];
    if (!name || !c) return;
    this.pending.delete(name);
    if (!this.proc) this.start();
    const id = this.next++;
    new Promise<Done>((ok, fail) => {
      this.busy = { id, name, ok, fail };
      this.proc!.stdin.write(`${JSON.stringify({ id, name, compiled: { floors: c.floors } })}\n`);
    }).then((d) => { if (d.laid || !d.path) this.onLaid(name, d); },
      (e: Error) => console.warn(`[stones] ${name}: ${e.message.split('\n').slice(-3).join(' ')}`))
      .finally(() => this.pump());
  }

  stop() { this.proc?.kill(); this.proc = null; for (const t of this.timers.values()) clearTimeout(t); }
}
