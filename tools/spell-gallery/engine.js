/* Spell Gallery engine.
 *
 * A vignette is a looping top-down scene drawn as a PURE FUNCTION OF TIME:
 * draw(g, t) is called every frame with t in [0, duration). Nothing is kept
 * between frames: positions come from easing/lerp over t, and particles come
 * from seeded helpers (g.burst, g.sparks...) given the time since they started.
 * That keeps every loop seamless and every frame reproducible (filmstrip.html).
 *
 * Arena is 400 x 260 logical units. Origin top-left, +y is down, angles in radians
 * (0 = east, PI/2 = south).
 *
 *   SG.register({
 *     id, name, family, status, oneLiner, situation, coop, source,
 *     duration: 5,          // seconds per loop
 *     floor: 'stone',       // 'stone' | 'meadow' | 'sand'
 *     draw(g, t) { ... }
 *   });
 */
(function () {
  const W = 400, H = 260;
  const TAU = Math.PI * 2;

  // Element palette. Every color used inside the arena comes from here.
  const EL = {
    fire: '#ff7b39', water: '#3fa1ff', cold: '#aeefff', lightning: '#c7a8ff',
    life: '#5fe07a', arcane: '#ff4f9b', earth: '#b5895a', shield: '#ffe08a',
    steam: '#e4e9f2', ice: '#cdf3ff', poison: '#9be04a', shadow: '#2b2240',
  };
  const ACTOR = {
    hero: '#f2c14e', ally: '#6ad1c9', ally2: '#ef8fd0',
    enemy: '#8bbf4a', brute: '#c46a4a', imp: '#a776e8',
  };

  // ---------- math ----------
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const seg = (t, a, b) => clamp((t - a) / (b - a));   // 0..1 progress over [a,b]
  const between = (t, a, b) => t >= a && t < b;
  const ease = {
    in: p => p * p,
    out: p => 1 - (1 - p) * (1 - p),
    inOut: p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    back: p => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
    elastic: p => (p === 0 || p === 1) ? p : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (TAU / 3)) + 1,
  };
  // Deterministic pseudo-random in [0,1) from any number of numeric seeds.
  function rand(...s) {
    let h = 2166136261;
    for (const v of s) { h ^= Math.floor(v * 1000) | 0; h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const angle = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
  // Point along a polyline [[x,y],...] at progress p (0..1), by length.
  function along(pts, p) {
    const lens = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const l = dist(...pts[i - 1], ...pts[i]); lens.push(l); total += l; }
    let d = clamp(p) * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        const q = lens[i] ? d / lens[i] : 0;
        return [lerp(pts[i][0], pts[i + 1][0], q), lerp(pts[i][1], pts[i + 1][1], q), angle(...pts[i], ...pts[i + 1])];
      }
      d -= lens[i];
    }
    return [...pts[pts.length - 1], 0];
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }
  function mix(h1, h2, p) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const c = (s) => Math.round(lerp(a >> s & 255, b >> s & 255, p));
    return '#' + ((1 << 24) + (c(16) << 16) + (c(8) << 8) + c(0)).toString(16).slice(1);
  }

  // ---------- floors (cached offscreen) ----------
  const floorCache = {};
  function makeFloor(kind, scale) {
    const key = kind + scale;
    if (floorCache[key]) return floorCache[key];
    const c = document.createElement('canvas');
    c.width = W * scale; c.height = H * scale;
    const x = c.getContext('2d'); x.scale(scale, scale);
    const base = { stone: '#4a4658', meadow: '#4f6b45', sand: '#8a7556' }[kind] || '#4a4658';
    x.fillStyle = base; x.fillRect(0, 0, W, H);
    if (kind === 'stone') {
      // Offset flagstones, each a slightly different tint.
      const th = 26;
      for (let r = 0; r * th < H + th; r++) {
        const off = (r % 2) * 20;
        for (let cx = -off; cx < W + 40; cx += 40) {
          const v = rand(r, cx) * 0.08 - 0.04;
          x.fillStyle = v > 0 ? hexA('#ffffff', v) : hexA('#000000', -v);
          x.fillRect(cx + 1, r * th + 1, 38, th - 2);
        }
      }
      x.strokeStyle = 'rgba(20,16,32,0.35)'; x.lineWidth = 1;
      for (let r = 0; r * th < H + th; r++) {
        x.beginPath(); x.moveTo(0, r * th); x.lineTo(W, r * th); x.stroke();
        const off = (r % 2) * 20;
        for (let cx = -off; cx < W + 40; cx += 40) { x.beginPath(); x.moveTo(cx, r * th); x.lineTo(cx, r * th + th); x.stroke(); }
      }
    } else {
      for (let i = 0; i < 900; i++) {
        const px = rand(i, 1) * W, py = rand(i, 2) * H, l = rand(i, 3);
        x.fillStyle = l > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.08)';
        if (kind === 'meadow') { x.fillRect(px, py, 1.2, 3 + l * 2); } else { x.fillRect(px, py, 1.5, 1.5); }
      }
    }
    // Vignette darkening toward the edges.
    const grd = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(10,6,24,0.45)');
    x.fillStyle = grd; x.fillRect(0, 0, W, H);
    floorCache[key] = c;
    return c;
  }

  // ---------- the drawing kit passed to vignettes ----------
  function makeKit(ctx, scale) {
    const g = {
      ctx, W, H, TAU, EL, ACTOR,
      clamp, lerp, seg, between, ease, rand, dist, angle, along, hexA, mix,
      t: 0, T: 5,

      floor(kind = 'stone') { ctx.drawImage(makeFloor(kind, scale), 0, 0, W, H); },

      shadow(x, y, r) {
        ctx.fillStyle = 'rgba(8,4,20,0.35)';
        ctx.beginPath(); ctx.ellipse(x + 2, y + r * 0.55, r * 1.05, r * 0.45, 0, 0, TAU); ctx.fill();
      },

      wall(x, y, w, h, o = {}) {
        ctx.fillStyle = 'rgba(8,4,20,0.35)'; ctx.fillRect(x + 3, y + 5, w, h);
        ctx.fillStyle = o.color || '#6d6680'; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, w, Math.min(4, h));
        ctx.strokeStyle = 'rgba(15,10,30,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      },

      pillar(x, y, r = 12, o = {}) {
        g.shadow(x, y, r);
        ctx.fillStyle = o.color || '#7a7290';
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.55, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(15,10,30,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
      },

      // Puddle; frozen 0..1 blends water into ice; charged 0..1 adds crackle.
      puddle(x, y, rx, ry, o = {}) {
        const fz = o.frozen || 0, ch = o.charged || 0;
        ctx.save();
        ctx.fillStyle = hexA(mix(EL.water, '#dff6ff', fz), 0.55 + fz * 0.25);
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = hexA('#ffffff', 0.25 + fz * 0.4); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.5, ry * 0.35, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
        if (fz > 0.5) {
          ctx.strokeStyle = hexA('#ffffff', (fz - 0.5) * 1.2); ctx.lineWidth = 0.8;
          for (let i = 0; i < 5; i++) {
            const a = rand(x, i) * TAU, l = rx * 0.7;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * ry / rx); ctx.stroke();
          }
        }
        if (ch > 0) {
          for (let i = 0; i < 4; i++) {
            const a = rand(Math.floor(g.t * 12), i, x) * TAU, rr = rand(i, Math.floor(g.t * 12)) * 0.8;
            g.bolt(x, y, x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr, { seed: i + Math.floor(g.t * 14), width: 1.2, alpha: ch, jag: 4 });
          }
        }
        ctx.restore();
      },

      grass(x, y, rx, ry, o = {}) {
        const burn = o.burning || 0, burnt = o.burnt || 0;
        ctx.fillStyle = hexA(mix('#5d9a3c', '#2a2420', burnt), 0.9);
        ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = hexA(mix('#86c45a', '#3a3028', burnt), 0.9); ctx.lineWidth = 1.2;
        for (let i = 0; i < rx * ry / 40; i++) {
          const a = rand(i, x) * TAU, r = Math.sqrt(rand(i, y));
          const px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 1, py - 4); ctx.stroke();
        }
        if (burn > 0) g.flames(x, y, rx * 0.85, ry * 0.85, { amount: burn });
      },

      // Flickering flames inside an ellipse.
      flames(x, y, rx, ry, o = {}) {
        const n = Math.round((o.count || 14) * (o.amount ?? 1));
        for (let i = 0; i < n; i++) {
          const life = 0.6, ph = (g.t + rand(i, x) * life) % life / life;
          const a = rand(i, 7, x) * TAU, r = Math.sqrt(rand(i, 9, y));
          const px = x + Math.cos(a) * rx * r, py = y + Math.sin(a) * ry * r - ph * 12;
          const s = (1 - ph) * (o.size || 5);
          ctx.fillStyle = hexA(ph < 0.4 ? '#ffd166' : EL.fire, (1 - ph) * 0.9);
          ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill();
        }
      },

      // A wizard seen from above: body, pointed hat, staff toward `facing`.
      // o: { color, facing, tip (element color for the staff glow), casting (0..1), alpha, label, scale }
      wizard(x, y, o = {}) {
        const col = o.color || ACTOR.hero, f = o.facing ?? 0, s = o.scale || 1, cast = o.casting || 0;
        ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
        g.shadow(x, y, 9 * s);
        // staff
        const sx = x + Math.cos(f + 0.5) * 6 * s, sy = y + Math.sin(f + 0.5) * 6 * s;
        const ex = sx + Math.cos(f) * (16 + cast * 3) * s, ey = sy + Math.sin(f) * (16 + cast * 3) * s;
        ctx.strokeStyle = '#6b4a2f'; ctx.lineWidth = 2.5 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        if (o.tip) { g.glow(ex, ey, (5 + cast * 7) * s, o.tip, 0.6 + cast * 0.4); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 1.6 * s, 0, TAU); ctx.fill(); }
        // robe
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, 9 * s, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(20,10,30,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
        // hat: a brim and a point leaning toward facing
        ctx.fillStyle = mix(col, '#1a1030', 0.45);
        ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, TAU); ctx.fill();
        ctx.fillStyle = mix(col, '#1a1030', 0.25);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(f) * 8 * s, y + Math.sin(f) * 8 * s);
        ctx.lineTo(x + Math.cos(f + 2.3) * 4.5 * s, y + Math.sin(f + 2.3) * 4.5 * s);
        ctx.lineTo(x + Math.cos(f - 2.3) * 4.5 * s, y + Math.sin(f - 2.3) * 4.5 * s);
        ctx.closePath(); ctx.fill();
        ctx.restore();
        if (o.label) g.label(o.label, x, y - 18 * s);
      },

      // Enemy blob. o: { r, color, facing, hp (0..1), hit (0..1 flash), status, dead (0..1), alpha }
      // status: 'wet' | 'frozen' | 'burning' | 'shocked' | 'slowed' | 'stunned' (or an array)
      enemy(x, y, o = {}) {
        const r = o.r || 9, dead = o.dead || 0;
        if (dead >= 1) return;
        const st = [].concat(o.status || []);
        ctx.save(); ctx.globalAlpha = (o.alpha ?? 1) * (1 - dead);
        const rr = r * (1 - dead * 0.6);
        g.shadow(x, y, rr);
        let col = o.color || ACTOR.enemy;
        if (st.includes('frozen')) col = mix(col, '#cdf3ff', 0.7);
        if (o.hit) col = mix(col, '#ffffff', o.hit);
        // wobbling blob body
        ctx.fillStyle = col; ctx.beginPath();
        const wob = st.includes('frozen') ? 0 : 1;
        for (let i = 0; i <= 16; i++) {
          const a = i / 16 * TAU, k = 1 + Math.sin(a * 3 + g.t * 6 + x) * 0.06 * wob;
          const px = x + Math.cos(a) * rr * k, py = y + Math.sin(a) * rr * k;
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.fill(); ctx.strokeStyle = 'rgba(20,10,30,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
        // eyes looking toward facing
        const f = o.facing ?? Math.PI;
        for (const side of [-1, 1]) {
          const ex = x + Math.cos(f) * rr * 0.35 + Math.cos(f + Math.PI / 2) * side * rr * 0.32;
          const ey = y + Math.sin(f) * rr * 0.35 + Math.sin(f + Math.PI / 2) * side * rr * 0.32;
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, rr * 0.2, 0, TAU); ctx.fill();
          ctx.fillStyle = '#1a1030'; ctx.beginPath(); ctx.arc(ex + Math.cos(f) * rr * 0.07, ey + Math.sin(f) * rr * 0.07, rr * 0.1, 0, TAU); ctx.fill();
        }
        if (st.includes('wet')) {
          ctx.fillStyle = hexA(EL.water, 0.35); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
          for (let i = 0; i < 2; i++) { const ph = (g.t * 1.5 + i * 0.5) % 1; ctx.fillStyle = hexA(EL.water, 1 - ph); ctx.beginPath(); ctx.arc(x + (i ? 4 : -5), y + rr * 0.6 + ph * 6, 1.6, 0, TAU); ctx.fill(); }
        }
        if (st.includes('frozen')) {
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(x, y, rr + 2, 0, TAU); ctx.stroke();
          for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); ctx.lineTo(x + Math.cos(a) * (rr + 5), y + Math.sin(a) * (rr + 5)); ctx.stroke(); }
        }
        if (st.includes('burning')) g.flames(x, y - rr * 0.2, rr * 0.7, rr * 0.5, { count: 8, size: 4 });
        if (st.includes('shocked')) g.sparks(x, y, { r: rr + 3, color: EL.lightning, count: 3 });
        if (st.includes('slowed')) { ctx.strokeStyle = hexA(EL.cold, 0.7); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(x, y, rr + 4, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
        if (st.includes('stunned')) { for (let i = 0; i < 3; i++) { const a = g.t * 5 + i * TAU / 3; ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr * 0.8, y - rr - 3 + Math.sin(a) * 2, 1.6, 0, TAU); ctx.fill(); } }
        if (o.hp != null && o.hp < 1) {
          ctx.fillStyle = 'rgba(10,6,20,0.7)'; ctx.fillRect(x - rr, y - rr - 7, rr * 2, 3);
          ctx.fillStyle = '#ff5d73'; ctx.fillRect(x - rr, y - rr - 7, rr * 2 * clamp(o.hp), 3);
        }
        ctx.restore();
      },

      // Soft radial glow (additive).
      glow(x, y, r, color, a = 0.8) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, hexA(color, a)); grd.addColorStop(1, hexA(color, 0));
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.restore();
      },

      // A glowing ball / projectile.
      orb(x, y, r, color, o = {}) {
        g.glow(x, y, r * 2.6, color, 0.55 * (o.alpha ?? 1));
        ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU); ctx.fill();
        ctx.restore();
      },

      // A rock (earth projectile or debris).
      rock(x, y, r, o = {}) {
        g.shadow(x, y, r * 0.8);
        ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0);
        ctx.fillStyle = o.color || EL.earth; ctx.beginPath();
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, k = 0.75 + rand(i, r) * 0.35; i ? ctx.lineTo(Math.cos(a) * r * k, Math.sin(a) * r * k) : ctx.moveTo(Math.cos(a) * r * k, Math.sin(a) * r * k); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(30,18,10,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.25, r * 0.35, 0, TAU); ctx.fill();
        ctx.restore();
      },

      // A beam from (x1,y1) to (x2,y2). o: { color, width, alpha }
      beam(x1, y1, x2, y2, o = {}) {
        const c = o.color || EL.arcane, w = o.width || 6, a = o.alpha ?? 1;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        const wob = 1 + Math.sin(g.t * 40) * 0.12;
        ctx.strokeStyle = hexA(c, 0.25 * a); ctx.lineWidth = w * 3 * wob; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = hexA(c, 0.8 * a); ctx.lineWidth = w * wob; ctx.stroke();
        ctx.strokeStyle = hexA('#ffffff', 0.85 * a); ctx.lineWidth = w * 0.35; ctx.stroke();
        ctx.restore();
        g.glow(x2, y2, w * 3, c, 0.8 * a);
      },

      // Jagged lightning between two points. o: { seed, color, width, alpha, jag }
      bolt(x1, y1, x2, y2, o = {}) {
        const c = o.color || EL.lightning, n = Math.max(3, Math.round(dist(x1, y1, x2, y2) / 12));
        const seed = o.seed ?? Math.floor(g.t * 20), jag = o.jag ?? 7;
        const nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
        const pts = [[x1, y1]];
        for (let i = 1; i < n; i++) { const p = i / n, d = (rand(seed, i) - 0.5) * 2 * jag; pts.push([lerp(x1, x2, p) + nx / nl * d, lerp(y1, y2, p) + ny / nl * d]); }
        pts.push([x2, y2]);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = o.alpha ?? 1; ctx.lineJoin = 'round';
        for (const [w, col] of [[(o.width || 2) * 3, hexA(c, 0.3)], [o.width || 2, c], [(o.width || 2) * 0.4, '#ffffff']]) {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.stroke();
        }
        ctx.restore();
      },

      // A cone spray from (x,y) toward `ang`. o: { color, spread (rad), len, count, alpha, size }
      spray(x, y, ang, o = {}) {
        const c = o.color || EL.water, sp = o.spread ?? 0.5, len = o.len || 90, n = o.count || 40, life = 0.5;
        for (let i = 0; i < n; i++) {
          const ph = ((g.t + rand(i, 3) * life) % life) / life;
          const a = ang + (rand(i, 5) - 0.5) * sp, d = ph * len * (0.7 + rand(i, 8) * 0.3);
          const s = (o.size || 3) * (0.6 + ph);
          ctx.fillStyle = hexA(c, (1 - ph) * (o.alpha ?? 0.85));
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU); ctx.fill();
        }
      },

      // Expanding or static ring. o: { color, width, alpha, dash }
      ring(x, y, r, o = {}) {
        ctx.save(); ctx.strokeStyle = hexA(o.color || EL.shield, o.alpha ?? 0.9); ctx.lineWidth = o.width || 2;
        if (o.dash) ctx.setLineDash(o.dash);
        ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.stroke(); ctx.restore();
      },

      // Filled translucent zone (circle). o: { color, alpha, edge }
      zone(x, y, r, o = {}) {
        const c = o.color || EL.life;
        ctx.save();
        const grd = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
        grd.addColorStop(0, hexA(c, (o.alpha ?? 0.25) * 0.5)); grd.addColorStop(1, hexA(c, o.alpha ?? 0.25));
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = hexA(c, (o.edge ?? 0.8)); ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -g.t * 12; ctx.stroke();
        ctx.restore();
      },

      // A magic circle / rune on the ground. o: { color, alpha, spin, armed (0..1) }
      rune(x, y, r, o = {}) {
        const c = o.color || EL.arcane, a = o.alpha ?? 0.9, rot = (o.spin ?? 0.6) * g.t;
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.strokeStyle = hexA(c, a); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, TAU); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i <= 5; i++) { const ang = i * 2 * TAU / 5 - Math.PI / 2; const px = Math.cos(ang) * r * 0.72, py = Math.sin(ang) * r * 0.72; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.stroke();
        for (let i = 0; i < 8; i++) { const ang = i / 8 * TAU; ctx.fillStyle = hexA(c, a); ctx.fillRect(Math.cos(ang) * r * 0.86 - 1, Math.sin(ang) * r * 0.86 - 1, 2, 2); }
        ctx.restore();
        if (o.armed) g.glow(x, y, r * 1.3, c, 0.35 * o.armed);
      },

      // Shield dome. o: { color, alpha, hit (0..1 ripple) }
      bubble(x, y, r, o = {}) {
        const c = o.color || EL.shield, a = o.alpha ?? 1;
        ctx.save();
        const grd = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        grd.addColorStop(0, hexA(c, 0.08 * a)); grd.addColorStop(0.85, hexA(c, 0.22 * a)); grd.addColorStop(1, hexA(c, 0.55 * a));
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = hexA(c, 0.9 * a); ctx.lineWidth = 1.8; ctx.stroke();
        // hex sheen
        ctx.strokeStyle = hexA('#ffffff', 0.25 * a); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r * 0.8, -2.4, -1.4); ctx.stroke();
        if (o.hit) { ctx.strokeStyle = hexA('#ffffff', o.hit); ctx.lineWidth = 3 * o.hit; ctx.beginPath(); ctx.arc(x, y, r * (1 + (1 - o.hit) * 0.15), 0, TAU); ctx.stroke(); }
        ctx.restore();
      },

      // A straight barrier segment (wall of shield/ice/fire). o: { color, alpha, thick }
      barrier(x1, y1, x2, y2, o = {}) {
        const c = o.color || EL.shield, a = o.alpha ?? 1, th = o.thick || 6;
        ctx.save(); ctx.lineCap = 'round';
        ctx.strokeStyle = hexA(c, 0.3 * a); ctx.lineWidth = th * 2.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.strokeStyle = hexA(c, 0.85 * a); ctx.lineWidth = th; ctx.stroke();
        ctx.strokeStyle = hexA('#ffffff', 0.5 * a); ctx.lineWidth = th * 0.3; ctx.stroke();
        ctx.restore();
      },

      // A seeded particle burst that started `age` seconds ago.
      // o: { seed, count, color, colors[], speed, life, size, gravity, spread, dir }
      burst(x, y, age, o = {}) {
        if (age < 0) return;
        const n = o.count || 24, life = o.life || 0.7, sp = o.speed || 90, seed = o.seed ?? (x + y);
        for (let i = 0; i < n; i++) {
          const lf = life * (0.6 + rand(seed, i, 1) * 0.4);
          if (age > lf) continue;
          const p = age / lf;
          const a = o.dir != null ? o.dir + (rand(seed, i, 2) - 0.5) * (o.spread ?? 1) : rand(seed, i, 2) * TAU;
          const v = sp * (0.3 + rand(seed, i, 3) * 0.7);
          const d = v * age * (1 - p * 0.5);
          const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d + (o.gravity || 0) * age * age;
          const col = o.colors ? o.colors[i % o.colors.length] : (o.color || EL.fire);
          ctx.fillStyle = hexA(col, 1 - p);
          ctx.beginPath(); ctx.arc(px, py, (o.size || 2.5) * (1 - p * 0.6), 0, TAU); ctx.fill();
        }
      },

      // An explosion: flash + shockwave + particles, `age` seconds after detonation.
      explosion(x, y, age, o = {}) {
        if (age < 0 || age > 1.2) return;
        const c = o.color || EL.fire, r = o.r || 30;
        g.glow(x, y, r * 1.6 * (0.6 + age), c, Math.max(0, 1 - age * 2));
        g.ring(x, y, r * ease.out(clamp(age / 0.45)), { color: c, width: 3 * (1 - clamp(age / 0.45)), alpha: 1 - clamp(age / 0.45) });
        g.burst(x, y, age, { seed: o.seed ?? 3, count: o.count || 30, colors: o.colors || [c, '#ffd166', '#ffffff'], speed: r * 3, life: 0.8, size: 3 });
      },

      // Little crackling sparks around a point.
      sparks(x, y, o = {}) {
        const n = o.count || 4, r = o.r || 12, fr = Math.floor(g.t * 16);
        for (let i = 0; i < n; i++) {
          const a = rand(fr, i, x) * TAU, a2 = a + (rand(fr, i, 2) - 0.5) * 1.2;
          g.bolt(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, x + Math.cos(a2) * r, y + Math.sin(a2) * r, { seed: fr + i, width: 1, jag: 2, color: o.color || EL.lightning });
        }
      },

      // A fading trail behind a moving point. fn(time) -> [x,y]. o: { color, len (s), width, steps }
      trail(fn, o = {}) {
        const len = o.len || 0.25, steps = o.steps || 10, c = o.color || '#ffffff';
        ctx.save(); ctx.lineCap = 'round';
        for (let i = 0; i < steps; i++) {
          const ta = g.t - len * i / steps, tb = g.t - len * (i + 1) / steps;
          if (tb < (o.from ?? -Infinity)) break;
          const [ax, ay] = fn(ta), [bx, by] = fn(tb);
          ctx.strokeStyle = hexA(c, (1 - i / steps) * 0.7); ctx.lineWidth = (o.width || 4) * (1 - i / steps);
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
        ctx.restore();
      },

      // Dashed aim/intent line.
      aim(x1, y1, x2, y2, o = {}) {
        ctx.save(); ctx.strokeStyle = hexA(o.color || '#ffffff', o.alpha ?? 0.5); ctx.lineWidth = 1.2; ctx.setLineDash([4, 4]); ctx.lineDashOffset = -g.t * 20;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
      },

      // Mouse cursor reticle.
      cursor(x, y, o = {}) {
        ctx.save(); ctx.strokeStyle = hexA(o.color || '#ffffff', o.alpha ?? 0.85); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.stroke();
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.stroke(); }
        ctx.restore();
      },

      // The element queue shown as little gems above a caster. els: array of element keys.
      queue(x, y, els, o = {}) {
        const n = els.length, gap = 9;
        els.forEach((e, i) => {
          const px = x + (i - (n - 1) / 2) * gap, py = y;
          ctx.fillStyle = 'rgba(10,6,20,0.6)'; ctx.beginPath(); ctx.arc(px, py, 4.5, 0, TAU); ctx.fill();
          ctx.fillStyle = hexA(EL[e] || e, o.alpha ?? 1); ctx.beginPath(); ctx.arc(px, py, 3.2, 0, TAU); ctx.fill();
        });
      },

      // Small floating label (e.g. "ally", "x2"). o: { color, size, alpha }
      label(text, x, y, o = {}) {
        ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
        ctx.font = `700 ${o.size || 9}px "Nunito Sans", system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(text).width + 8;
        ctx.fillStyle = 'rgba(12,8,26,0.7)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 7, w, 14, 7); ctx.fill();
        ctx.fillStyle = o.color || '#ffffff'; ctx.fillText(text, x, y + 0.5);
        ctx.restore();
      },

      // Damage / effect number that floats up. age in seconds since it appeared.
      popup(text, x, y, age, o = {}) {
        if (age < 0 || age > 1) return;
        g.label(text, x, y - age * 16, { color: o.color || '#ffd166', alpha: 1 - age * age, size: o.size || 9 });
      },
    };
    return g;
  }

  // ---------- registry & rendering ----------
  const registry = [];
  function register(v) { registry.push(Object.assign({ duration: 5, floor: 'stone', status: 'new' }, v)); }

  // Render one frame of vignette v at time t onto canvas.
  function renderFrame(canvas, v, t) {
    const scale = canvas.width / W;
    const ctx = canvas.getContext('2d');
    if (!canvas._kit) canvas._kit = makeKit(ctx, scale);
    const g = canvas._kit;
    g.t = t; g.T = v.duration;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    g.floor(v.floor);
    try { v.draw(g, t); } catch (e) {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ff8080'; ctx.font = '12px monospace'; ctx.fillText('vignette error: ' + e.message, 10, 20);
      if (!v._warned) { console.error(v.id, e); v._warned = true; }
    }
    // Soft fade at the loop seam so restarts read as a cut, not a glitch.
    const edge = Math.min(seg(t, 0, 0.18) , seg(v.duration - t, 0, 0.18));
    if (v.fade !== false && edge < 1) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(14,10,28,${1 - edge})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }

  window.SG = { W, H, EL, ACTOR, register, registry, renderFrame };
})();
