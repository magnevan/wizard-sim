#!/usr/bin/env node
// The map CLI (from game/):
//   npm run content:check                         every check (schema, references, placement, reachability, stale module)
//   npm run content:build                         compile the maps into packages/sim/src/rooms.gen.ts
//   npm run content -- list                       the levels: size, entities, rock walls, room hash
//   npm run content -- grid <level>               the Terrain layer as text rows ('.' floor, '#' rock)
//   npm run content -- grid <level> --entities    the same with entities marked (a view only)
//   npm run content -- grid <level> --write <file|->   write text rows back into the level's file
// After a write, run content:build, then content:check.
import { writeFileSync } from 'node:fs';
import { runCheck } from './check.mjs';
import { compileProject, emitModule, hex, roomHash } from './compile.mjs';
import { printGrid, readText, writeGrid } from './grid.mjs';
import { GEN_OUT, findLevel, layerOf, loadProject } from './ldtk.mjs';

const [cmd, ...args] = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };

function fail(msg) { console.error(msg); process.exit(1); }

switch (cmd) {
  case 'check': {
    const { errors, rooms } = runCheck();
    if (errors.length) { console.error(`content:check: ${errors.length} problem(s)\n` + errors.map((e) => '  - ' + e).join('\n')); process.exit(1); }
    console.log(`content:check: ok (${rooms.map((r) => `${r.id} ${hex(roomHash(r))}`).join(', ')})`);
    break;
  }
  case 'build': {
    const { rooms, errors } = compileProject(loadProject());
    if (errors.length) fail('content:build: the maps don\'t compile:\n' + errors.map((e) => '  - ' + e).join('\n'));
    writeFileSync(GEN_OUT, emitModule(rooms));
    console.log(`wrote ${GEN_OUT}: ${rooms.map((r) => `${r.id} ${hex(roomHash(r))}`).join(', ')}`);
    break;
  }
  case 'list': {
    const loaded = loadProject();
    const { rooms } = compileProject(loaded);
    loaded.levels.forEach(({ level, path }, i) => {
      const r = rooms[i], ents = layerOf(level, 'Entities')?.entityInstances ?? [];
      const counts = {};
      for (const e of ents) counts[e.__identifier] = (counts[e.__identifier] ?? 0) + 1;
      console.log(`${level.identifier.padEnd(10)} ${r.w} x ${r.h} u  ${hex(roomHash(r))}  rock walls ${r.rock.length}  ${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')}  ${path ?? '(in world.ldtk)'}`);
    });
    break;
  }
  case 'grid': {
    const name = args.find((a) => !a.startsWith('--') && a !== opt('write'));
    if (!name) fail('usage: grid <level> [--entities] [--write <file|->]');
    const loaded = loadProject(), entry = findLevel(loaded, name);
    const src = opt('write');
    if (src !== undefined) {
      const changed = writeGrid(loaded, entry, readText(src));
      console.log(`${entry.level.identifier}: ${changed} cell(s) changed. Now run: npm run content:build && npm run content:check`);
    } else process.stdout.write(printGrid(loaded.project, entry.level, { entities: flag('entities') }));
    break;
  }
  default:
    fail('usage: content <check | build | list | grid <level> [--entities] [--write <file|->]>');
}
