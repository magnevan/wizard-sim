/**
 * The map editor's link to the Python compiler: one long-lived tools/kit/worker.py, so an edit compiles in tens of
 * milliseconds rather than paying Python's start-up. Requests go one per line and replies come back by id; if the
 * worker dies it is restarted on the next request, and what was in flight fails with its stderr.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import type { Scene } from './ops';

export type Finding = { code: string; severity: 'error' | 'warning'; msg: string; at: [number, number] | null; refs: string[] };
export type Inst = { p: string; x: number; y: number; x2?: number; y2?: number; h: number; low?: number; rot: number; len?: number; v?: string; src?: string; e?: [number, number]; o?: string; [k: string]: unknown };
export type Compiled = {
  G: number; size: [number, number]; floors: { t: string; id: string; h: number; mat: string; polys: number[][][][] }[];
  instances: Inst[]; findings: Finding[]; errors: string[]; warnings: string[]; pieces: Record<string, number>; ms?: number;
};

export class CompileWorker {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private next = 1;
  private waiting = new Map<number, { ok: (r: Compiled) => void; fail: (e: Error) => void }>();
  private buf = '';
  private stderr = '';

  constructor(private kitDir: string, private python = process.env.PYTHON ?? 'python') {}

  private start() {
    const p = spawn(this.python, ['-u', join(this.kitDir, 'worker.py')], { stdio: 'pipe' });
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d: string) => {
      this.buf += d;
      let nl;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl); this.buf = this.buf.slice(nl + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as { id: number; result?: Compiled; error?: string; ms?: number };
        const w = this.waiting.get(msg.id); this.waiting.delete(msg.id);
        if (!w) continue;
        if (msg.result) w.ok({ ...msg.result, ms: msg.ms }); else w.fail(new Error(msg.error ?? 'compile failed'));
      }
    });
    p.stderr.on('data', (d) => { this.stderr = (this.stderr + d).slice(-4000); });
    p.on('exit', () => {
      if (this.proc === p) this.proc = null;
      for (const w of this.waiting.values()) w.fail(new Error(`the compile worker stopped: ${this.stderr.trim() || 'no output'}`));
      this.waiting.clear(); this.buf = '';
    });
    p.on('error', (e) => { for (const w of this.waiting.values()) w.fail(e); this.waiting.clear(); });
    this.proc = p;
  }

  compile(scene: Scene): Promise<Compiled> {
    if (!this.proc) this.start();
    const id = this.next++;
    return new Promise((ok, fail) => {
      this.waiting.set(id, { ok, fail });
      this.proc!.stdin.write(`${JSON.stringify({ id, scene })}\n`);
    });
  }

  stop() { this.proc?.kill(); this.proc = null; }
}
