// Packages the built client as a claude.ai artifact: artifact/index.html (a page body, which
// the artifact host wraps in its own document) plus the bundle files under artifact/assets/.
// Usage: npm run artifact   (then publish artifact/index.html with every assets/* file)
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../packages/client/dist');
const out = join(here, '../artifact');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = /<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
if (!entry) throw new Error('No module entry in dist/index.html; run npm run build first');
const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(dist, 'assets'), join(out, 'assets'), { recursive: true });
writeFileSync(join(out, 'index.html'), `<title>Wizard Sim</title>
<style>${style}</style>
<div id="app"></div>
<div id="hud"></div>
<script type="module" src="./${entry}"></script>
`);
console.log(`artifact/ ready: index.html + ${readdirSync(join(out, 'assets')).length} asset files (entry ${entry})`);
