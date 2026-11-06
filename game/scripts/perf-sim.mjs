// Sim timing in node: step() over long bot-played runs (the Arena, and Survive held at a late wave).
// Imported by perf.mjs; also runs alone: node scripts/perf-sim.mjs [--ticks 6000]
import { createServer } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export async function simPerf({ ticks = 6000 } = {}) {
  const server = await createServer({ root: join(here, '..'), logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const sim = await server.ssrLoadModule('/packages/sim/src/index.ts');
    const out = [];
    const run = (name, setup) => {
      const w = sim.createWorld(7, 2, { room: setup.room });
      setup.before?.(w);
      const bots = [sim.newBotMemory(), sim.newBotMemory()];
      const times = new Float64Array(ticks);
      let events = 0, maxEvents = 0, bodies = 0, maxBodies = 0;
      const inputs = [];
      for (let p = 0; p < sim.MAX_SEATS; p++) inputs.push(sim.NO_INPUT);
      // warm the JIT on a throwaway world first, so the first ticks aren't all compile time
      for (let t = 0; t < ticks; t++) {
        for (let p = 0; p < 2; p++) inputs[p] = sim.botInput(w, p, bots[p]);
        setup.each?.(w);
        const t0 = performance.now();
        sim.step(w, inputs);
        times[t] = performance.now() - t0;
        events += w.events.length; maxEvents = Math.max(maxEvents, w.events.length);
        let n = 0; for (let i = 0; i < w.bodies.kind.length; i++) if (w.bodies.kind[i]) n++;
        bodies += n; maxBodies = Math.max(maxBodies, n);
      }
      const sorted = Array.from(times).sort((a, b) => a - b);
      const sum = sorted.reduce((a, b) => a + b, 0);
      out.push({
        name, ticks,
        meanMs: +(sum / ticks).toFixed(4), p50Ms: +sorted[ticks >> 1].toFixed(4), p99Ms: +sorted[Math.floor(ticks * 0.99)].toFixed(4), maxMs: +sorted[ticks - 1].toFixed(3),
        events: +(events / ticks).toFixed(1), maxEvents, bodies: +(bodies / ticks).toFixed(1), maxBodies,
        hash: sim.hex(sim.hashWorld(w)),
      });
    };
    const god = (w) => { for (let s = 0; s < 2; s++) sim.devHeal(w, s); sim.devRefillRunes(w, 0); sim.devRefillRunes(w, 1); };
    run('warmup', { room: 'arena' });
    out.length = 0;
    run('arena autoplay', { room: 'arena' });
    run('arena wave 8, god', { room: 'arena', before: (w) => sim.devStartWave(w, 8, 1), each: god });
    run('survive wave 12, god', { room: 'survive', before: (w) => sim.devStartWave(w, 12, 1), each: (w) => { god(w); sim.devSkipLull(w); } });
    // the golden replay, timed whole (what check:browser runs)
    const g0 = performance.now();
    const r = sim.runReplay(sim.scriptedReplay(1800));
    out.push({ name: 'golden replay 1800 ticks', totalMs: +(performance.now() - g0).toFixed(1), hash: sim.hex(r.hash) });
    return out;
  } finally {
    await server.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const i = process.argv.indexOf('--ticks');
  console.table(await simPerf({ ticks: i > 0 ? Number(process.argv[i + 1]) : 6000 }));
}
