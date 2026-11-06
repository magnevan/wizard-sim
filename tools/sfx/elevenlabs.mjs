// Sound effects from ElevenLabs, through its signed-in CLI (no key in this repo). Spends credits, so every call
// is logged to .reference/audio/generated/calls.jsonl, and a run refuses to go past MAX_PER_DAY calls.
//
//   node tools/sfx/elevenlabs.mjs tools/sfx/sigil.json            (every sound in the list not yet made)
//   node tools/sfx/elevenlabs.mjs tools/sfx/sigil.json place-1    (just these ids)
//
// A list is [{ id, text, secs, loop?, influence? }]. Clips land in the gitignored .reference folder, where only
// the dev server can reach them: they're from the free plan, which doesn't clear them for the public game.
// A made clip is never overwritten, because it cost credits: pick a new id for another take.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, '.reference', 'audio', 'generated');
const LOG = join(OUT, 'calls.jsonl');
const MAX_PER_DAY = 30;
const MODEL = 'eleven_text_to_sound_v3';
const FORMAT = 'wav_48000';

const cli = (args, input) => spawnSync('elevenlabs', args, { shell: true, input, encoding: 'utf8', maxBuffer: 1 << 24 });
const used = () => {
  const r = cli(['user', 'subscription', 'get', '--format', 'json', '--query', 'character_count']);
  return r.status === 0 ? Number(r.stdout.trim()) : NaN;
};

const [list, ...only] = process.argv.slice(2);
if (!list) { console.error('usage: elevenlabs.mjs <list.json> [ids...]'); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const today = new Date().toISOString().slice(0, 10);
const past = existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
let left = MAX_PER_DAY - past.filter((c) => c.at.startsWith(today)).length;

for (const s of JSON.parse(readFileSync(list, 'utf8'))) {
  if (only.length && !only.includes(s.id)) continue;
  const file = join(OUT, `${s.id}.wav`);
  if (existsSync(file)) { console.log(`${s.id}: already made`); continue; }
  if (left <= 0) { console.error(`stopped: ${MAX_PER_DAY} calls today`); process.exit(2); }
  left--;
  const body = { text: s.text, model_id: MODEL, duration_seconds: s.secs, prompt_influence: s.influence ?? 0.5, loop: !!s.loop };
  const r = cli(['text-to-sound-effects', 'convert', '--json', '-', '--output-format', FORMAT, '-o', `"${file}"`], JSON.stringify(body));
  const ok = r.status === 0 && existsSync(file) && statSync(file).size > 1000;
  appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), id: s.id, ...body, ok })}\n`);
  console.log(`${s.id}: ${ok ? 'made' : 'FAILED'}`);
  if (!ok) { console.error((r.stderr || r.stdout).slice(0, 600)); process.exit(3); }
}
// Once a run: the counter lags, and asking after every call trips the rate limit.
console.log(`used ${used()} credits on this plan; ${left} calls left today`);
