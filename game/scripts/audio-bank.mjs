// Builds the sample bank from content/audio/bank.json with local ffmpeg: cuts, trims silence, normalises,
// makes loops seamless, and writes mono Ogg Vorbis to packages/client/public/audio/, plus bank.gen.ts.
//   npm run audio:bank                            rebuild the bank from content/audio/sources
//   npm run audio:bank -- --originals <dir>       first re-cut the Commons excerpts from full downloads
//                                                 (only for a new or moved cut; see content/audio/README.md)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const content = join(here, '../content/audio');
const out = join(here, '../packages/client/public/audio');
const gen = join(here, '../packages/client/src/audio/bank.gen.ts');
const SR = 44100, QUALITY = '3';
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const originals = arg('originals');

function ffmpeg(args, opts = {}) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 28, ...opts });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.stderr}`);
  return r.stdout;
}

/** A Commons clip's excerpt, kept in the repo instead of the whole recording: the cut plus a little either side. */
const cutPath = (c) => join(content, 'sources/commons/cuts', `${c.id}.ogg`);
const isCut = (c) => c.src.startsWith('commons/');

function recut(c) {
  const file = c.src.replace(/^commons\//, '');
  if (!existsSync(join(originals, file))) return; // reported below, if there's no excerpt either
  ffmpeg(['-ss', String(c.start ?? 0), '-t', String(c.dur), '-i', join(originals, file), '-ac', '1', '-c:a', 'libvorbis', '-q:a', '6', cutPath(c)]);
}

function decode(path, af) {
  const b = ffmpeg(['-i', path, '-ac', '1', '-ar', String(SR), ...(af ? ['-af', af] : []), '-f', 'f32le', 'pipe:1']);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

/** Silence off the front (a late attack sounds like lag) and the back. */
function trim(x) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const gate = peak * 0.02;
  let a = 0, b = x.length;
  while (a < b && Math.abs(x[a]) < gate) a++;
  while (b > a && Math.abs(x[b - 1]) < gate) b--;
  return x.subarray(Math.max(0, a - 16), Math.min(x.length, b + 64));
}

function finish(x, peakTo) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const o = new Float32Array(x.length), g = peak > 0 ? peakTo / peak : 1;
  for (let i = 0; i < x.length; i++) o[i] = x[i] * g;
  return o;
}

/** Ends can't click: 2 ms in, 12 ms out, or a tenth of a clip shorter than that. */
function edges(x) {
  const a = Math.min(Math.floor(SR * 0.002), Math.floor(x.length / 10)), b = Math.min(Math.floor(SR * 0.012), Math.floor(x.length / 10));
  for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a;
  for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= i / b;
  return x;
}

/**
 * A loop is judged by how loud it sits, not by its peak: crackle is mostly quiet with rare spikes, and peak
 * normalising leaves it near silent. Brought to a target RMS, with tanh rounding off the spikes that go over.
 */
function loudness(x, target) {
  let sq = 0;
  for (const v of x) sq += v * v;
  const g = target / Math.max(1e-6, Math.sqrt(sq / x.length)), o = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) o[i] = Math.tanh(x[i] * g * 1.1) * 0.92;
  return o;
}

/** Tail crossfaded into the head, equal power (synth.ts makeLoop). */
function seamless(x, secs) {
  const n = Math.min(x.length - 1, Math.floor(secs * SR)), f = x.length - n, o = x.slice(0, n);
  for (let i = 0; i < f && i < n; i++) {
    const t = (i + 0.5) / f;
    o[i] = x[i] * Math.sin((t * Math.PI) / 2) + x[n + i] * Math.cos((t * Math.PI) / 2);
  }
  return o;
}

const { clips } = JSON.parse(readFileSync(join(content, 'bank.json'), 'utf8'));
mkdirSync(out, { recursive: true });
mkdirSync(join(content, 'sources/commons/cuts'), { recursive: true });
for (const f of readdirSync(out)) rmSync(join(out, f));
const tmp = mkdtempSync(join(tmpdir(), 'audio-bank-'));
const built = [];
let bytes = 0;
for (const c of clips) {
  if (isCut(c) && originals) recut(c);
  const src = isCut(c) ? cutPath(c) : join(content, 'sources', c.src);
  if (!existsSync(src)) { console.warn(`missing ${c.id}: ${src}`); continue; }
  // a Kenney clip's start and dur cut it here; a Commons clip was cut when its excerpt was made
  let x = decode(src, c.af);
  if (!isCut(c) && (c.start !== undefined || c.dur !== undefined)) x = x.subarray(Math.floor((c.start ?? 0) * SR), c.dur ? Math.floor(((c.start ?? 0) + c.dur) * SR) : undefined);
  if (c.loop) x = seamless(loudness(x, c.rms ?? 0.14), c.loop);
  else x = edges(finish(trim(x), c.peak ?? 0.9));
  const wav = join(tmp, `${c.id}.f32`);
  writeFileSync(wav, Buffer.from(x.buffer, x.byteOffset, x.byteLength));
  const ogg = join(out, `${c.id}.ogg`);
  ffmpeg(['-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', wav, '-c:a', 'libvorbis', '-q:a', QUALITY, ogg]);
  bytes += statSync(ogg).size;
  built.push({ id: c.id, loop: !!c.loop, secs: Number((x.length / SR).toFixed(3)), src: c.src.split('-')[0].split('/')[0] });
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(gen, `// Generated by scripts/audio-bank.mjs from content/audio/bank.json. Don't edit by hand: npm run audio:bank.
export interface BankClip { id: string; loop: boolean; secs: number; src: string }
export const BANK: readonly BankClip[] = ${JSON.stringify(built, null, 0).replace(/\},\{/g, '},\n  {').replace(/^\[/, '[\n  ').replace(/\]$/, ',\n]')};
`);
console.log(`${built.length} of ${clips.length} clips, ${Math.round(bytes / 1024)} KB`);
