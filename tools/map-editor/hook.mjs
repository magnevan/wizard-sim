#!/usr/bin/env node
/**
 * hook.mjs - Claude Code UserPromptSubmit hook for the map editor.
 * Prints any new (unseen) pins as context, then marks them seen so they are not repeated.
 * Must be fast and never fail a prompt: 600 ms total budget, every error means print nothing, exit 0.
 */
const BASE = (process.env.MAP_EDITOR_URL || 'http://127.0.0.1:5187').replace(/\/$/, '');
const signal = AbortSignal.timeout(600);

async function get(route) {
  const res = await fetch(`${BASE}/__map/${route}`, { signal });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

async function main() {
  const { scenes } = await get('scenes');
  const lines = [];
  const toMark = [];
  let count = 0;
  for (const s of scenes || []) {
    const { pins } = await get(`pins?name=${encodeURIComponent(s.name)}&status=new`);
    if (!pins?.length) continue;
    for (const p of pins) {
      const a = p.anchor || {};
      const where = [`(${a.x},${a.y})`, a.obj && `obj ${a.obj}`, a.inst && `piece ${a.inst.p ?? a.inst}`].filter(Boolean).join(', ');
      lines.push(`- ${s.name} ${p.id}: ${p.note} [${where}]`);
      count++;
    }
    toMark.push({ name: s.name, ids: pins.map((p) => p.id) });
  }
  if (!count) return;
  console.log([
    `Map editor: ${count} new pin(s)`,
    ...lines,
    'Use node tools/map-editor/cli.mjs (pins / query / view / apply) to act on them; reply and resolve each pin with an outcome (scene, rule or piece).',
  ].join('\n'));
  for (const m of toMark) {
    await fetch(`${BASE}/__map/pins`, {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: m.name, op: 'seen', ids: m.ids }),
    });
  }
}

main().catch(() => {}).finally(() => process.exit(0));
