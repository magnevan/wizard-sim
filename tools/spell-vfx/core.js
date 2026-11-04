/* Spell VFX: shared constants and pure helpers. The camera constants match
 * tools/art-pixel-hd/scene.js (pass 2, about 67 degrees): a ground circle of radius r is
 * an r by r*FY ellipse, height is drawn straight up, characters at CU px per unit.
 * Every vignette is a pure function of its local time, so ?t= freezes any frame. */
(function () {
  'use strict';
  const PB = (window.PB = window.PB || {});
  const TAU = Math.PI * 2, FY = 0.88, HZ = 0.38, CU = 0.8;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const mod = (a, n) => ((a % n) + n) % n;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const smooth = (k) => k * k * (3 - 2 * k);
  const easeOut = (k) => 1 - (1 - k) * (1 - k);
  const easeIn = (k) => k * k;
  function rand(a, b = 0, c = 0) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 40503, 668265263) ^ Math.imul((c | 0) + 32587, 1442695041);
    h = Math.imul(h ^ (h >>> 15), -2048144777); h = Math.imul(h ^ (h >>> 13), -1028477379); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // The current vignette's loop length. The stage sets it before each frame.
  PB.LOOP = 3;
  // Deterministic particles: a steady emitter whose spawn indices wrap with the loop.
  // fn(i, age 0..1, spawnTime) -> particle or null. from/to limit spawning to a window.
  function emit(t, rate, life, fn, from, to) {
    const LOOP = PB.LOOP, n = Math.max(1, Math.round(LOOP * rate)), dt = LOOP / n, out = [];
    const k0 = Math.ceil((t - life) / dt), k1 = Math.floor(t / dt);
    for (let k = k0; k <= k1; k++) {
      const ts = k * dt;
      if (from != null && (ts < from || ts > to)) continue;
      const age = (t - ts) / life;
      if (age < 0 || age >= 1) continue;
      const p = fn(mod(k, n), age, ts);
      if (p) out.push(p);
    }
    return out;
  }
  // 0 -> 1 -> 0 envelope: rises over [a, a+up], holds, falls over [b-down, b].
  const env = (t, a, b, up = 0.1, down = 0.15) => Math.min(seg(t, a, a + up), 1 - seg(t, b - down, b));
  Object.assign(PB, { TAU, FY, HZ, CU, clamp, lerp, mod, seg, smooth, easeOut, easeIn, rand, emit, env });
})();
