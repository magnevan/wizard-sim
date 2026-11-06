// Generate one image with a Gemini image model, for the art trial. The key is paid: every call is
// logged to out/gemini-calls.jsonl, and a run refuses to go past MAX_PER_DAY calls.
//
//   node tools/art-trial/gemini.mjs --prompt "..." --out lectern-1 [--ref path.png ...] [--model id]
//   node tools/art-trial/gemini.mjs --models        (lists the image-capable models for this key; free)
//
// The key is read from GEMINI_API_KEY, or else from .secrets/gemini.key (gitignored). It is never
// printed or logged.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = join(HERE, 'out');
const LOG = join(OUT, 'gemini-calls.jsonl');
const MAX_PER_DAY = 20;
const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const API = 'https://generativelanguage.googleapis.com/v1beta';

const arg = (name) => { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; };
const args = (name) => process.argv.flatMap((a, i) => (a === '--' + name ? [process.argv[i + 1]] : []));

function key() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const f = join(ROOT, '.secrets', 'gemini.key');
  if (!existsSync(f)) { console.error(`No key: put it in ${f} (one line), or set GEMINI_API_KEY.`); process.exit(2); }
  return readFileSync(f, 'utf8').trim();
}

async function call(path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': key(), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

mkdirSync(OUT, { recursive: true });

if (process.argv.includes('--models')) {
  const r = await call('models?pageSize=200');
  for (const m of r.models ?? []) if (/image|imagen/i.test(m.name)) console.log(m.name.replace('models/', ''), '|', (m.supportedGenerationMethods ?? []).join(','));
  process.exit(0);
}

const prompt = arg('prompt'), name = arg('out'), model = arg('model') ?? DEFAULT_MODEL;
if (!prompt || !name) { console.error('Usage: --prompt "..." --out <name> [--ref img.png ...] [--model id]'); process.exit(2); }

const today = new Date().toISOString().slice(0, 10);
const used = existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes(`"day":"${today}"`)).length : 0;
if (used >= MAX_PER_DAY) { console.error(`Refusing: ${used} calls today already (cap ${MAX_PER_DAY}; edit MAX_PER_DAY if the user agrees).`); process.exit(3); }

const parts = [{ text: prompt }];
for (const ref of args('ref')) {
  const mime = extname(ref).toLowerCase() === '.jpg' ? 'image/jpeg' : 'image/png';
  parts.push({ inlineData: { mimeType: mime, data: readFileSync(ref).toString('base64') } });
}
const t0 = Date.now();
const r = await call(`models/${model}:generateContent`, { contents: [{ parts }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } });
const outParts = r.candidates?.[0]?.content?.parts ?? [];
const files = [];
let note = '';
outParts.forEach((p, i) => {
  if (p.inlineData?.data) {
    const f = join(OUT, `${name}${files.length ? '-' + files.length : ''}.png`);
    writeFileSync(f, Buffer.from(p.inlineData.data, 'base64'));
    files.push(f);
  } else if (p.text) note += p.text;
  void i;
});
appendFileSync(LOG, JSON.stringify({ day: today, at: new Date().toISOString(), model, name, prompt, refs: args('ref'), files, ms: Date.now() - t0, usage: r.usageMetadata ?? null }) + '\n');
console.log(files.length ? files.join('\n') : 'No image returned.', note ? `\nModel note: ${note.slice(0, 400)}` : '');
console.log(`(${used + 1}/${MAX_PER_DAY} calls today)`);
