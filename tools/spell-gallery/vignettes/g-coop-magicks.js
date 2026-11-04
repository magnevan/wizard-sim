// Co-op Magicks (docs/explorations/2026-11-03-coop-magicks.md).
// Every card shows the "open + join" moment: the first caster types the sequence
// and a glyph appears over them, the partner types the same sequence and joins,
// then the Magick happens with each player doing their own part.
(function () {
  // ---------- local helpers ----------
  const O = 1.0, J = 1.9;   // default open and join times

  function toss(x0, y0, x1, y1, h, p) {
    const gy = y0 + (y1 - y0) * p;
    return [x0 + (x1 - x0) * p, gy - h * 4 * p * (1 - p), gy];
  }
  function groundShadow(g, x, y, r, a = 1) {
    g.ctx.save(); g.ctx.globalAlpha = a; g.shadow(x, y, r); g.ctx.restore();
  }
  function hpBar(g, x, y, hp, o = {}) {
    const { ctx } = g, w = o.w || 20;
    ctx.save(); ctx.globalAlpha = o.alpha ?? 1;
    ctx.fillStyle = 'rgba(10,6,20,0.75)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = o.color || '#5fe07a'; ctx.fillRect(x - w / 2, y, w * g.clamp(hp), 3);
    ctx.restore();
  }
  function tag(g, text, x, y, t0, t1, color, size) {
    const t = g.t; if (t < t0 || t >= t1) return;
    g.label(text, x, y, { color, size, alpha: g.seg(t, t0, t0 + 0.12) * (1 - g.seg(t, t1 - 0.2, t1)) });
  }
  function staffTip(x, y, f, cast = 0) {
    const sx = x + Math.cos(f + 0.5) * 6, sy = y + Math.sin(f + 0.5) * 6;
    return [sx + Math.cos(f) * (16 + cast * 3), sy + Math.sin(f) * (16 + cast * 3)];
  }
  function shake(g, t0, amp = 3, dur = 0.35) {
    const t = g.t; if (t < t0 || t > t0 + dur) return [0, 0];
    const k = 1 - (t - t0) / dur;
    return [Math.sin(t * 97) * amp * k, Math.cos(t * 83) * amp * k];
  }
  // Quick staff flourish around time c.
  const castPulse = (g, c) => g.seg(g.t, c - 0.25, c) * (1 - g.seg(g.t, c + 0.1, c + 0.4));
  // Walking bob while moving.
  const bob = (g, on) => (on ? -Math.abs(Math.sin(g.t * 11)) * 1.5 : 0);

  // Gems appearing one by one over a caster while they type the sequence.
  function typing(g, x, y, seq, t0, t1, step = 0.15) {
    const t = g.t; if (t < t0 || t >= t1) return;
    const n = Math.min(seq.length, 1 + Math.floor((t - t0) / step));
    g.queue(x, y - 22, seq.slice(0, n));
  }
  // The open-Magick glyph hovering over a caster. Countdown arc until someone joins.
  function glyph(g, x, y, color, t0, tj, t1) {
    const t = g.t; if (t < t0 || t >= t1) return;
    const { ctx, seg, ease, TAU } = g;
    const s = ease.back(seg(t, t0, t0 + 0.3)), a = 1 - seg(t, t1 - 0.3, t1);
    const flash = t >= tj ? 1 - seg(t, tj, tj + 0.45) : 0;
    const gy = y - 34 + Math.sin(t * 4) * 1.5;
    g.glow(x, gy, 16 + flash * 16, color, (0.45 + 0.15 * Math.sin(t * 8) + flash * 0.5) * a);
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(12,8,26,0.55)'; ctx.beginPath(); ctx.arc(x, gy, 10 * s, 0, TAU); ctx.fill();
    g.rune(x, gy, 9 * s, { color: g.mix(color, '#ffffff', flash * 0.7), alpha: 0.95, spin: 1.6 });
    if (t < tj) {
      const left = 1 - seg(t, t0, t0 + 3.5);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, gy, 13, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke();
    }
    ctx.restore();
  }
  // Full open + join sequence between caster p1 (opens) and p2 (joins).
  function openJoin(g, p1, p2, seq, color, o = {}) {
    const t = g.t, tO = o.open ?? O, tJ = o.join ?? J, end = o.end ?? tJ + 0.75;
    typing(g, p1[0], p1[1], seq, tO - 0.55, tO + 0.05);
    typing(g, p2[0], p2[1], seq, tJ - 0.55, tJ + 0.05);
    glyph(g, p1[0], p1[1], color, tO, tJ, end);
    glyph(g, p2[0], p2[1], color, tJ, tJ, end);
    if (t >= tJ && t < tJ + 0.5) {
      const a = 1 - g.seg(t, tJ + 0.15, tJ + 0.5);
      g.beam(p1[0], p1[1] - 34, p2[0], p2[1] - 34, { color, width: 3, alpha: a });
    }
    g.burst(p1[0], p1[1] - 34, t - tO, { seed: 11, count: 10, color, speed: 40, life: 0.4, size: 2 });
    g.burst(p2[0], p2[1] - 34, t - tJ, { seed: 12, count: 14, colors: [color, '#ffffff'], speed: 55, life: 0.45, size: 2 });
    tag(g, 'open', p1[0] + (o.dx1 ?? 32), p1[1] - 34, tO, tO + 0.8, color);
    tag(g, 'join!', p2[0] + (o.dx2 ?? 32), p2[1] - 34, tJ, tJ + 0.8, color);
  }
  // A flat mirror standing on the ground; `n` is its facing (normal) angle.
  function mirror(g, x, y, n, s, a, hot = 0) {
    if (s <= 0.01 || a <= 0) return;
    const { ctx, EL } = g;
    g.glow(x, y, 26 * s, EL.arcane, (0.25 + hot * 0.45) * a);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.rotate(n + Math.PI / 2);
    ctx.fillStyle = 'rgba(8,4,20,0.35)'; ctx.fillRect(-15 * s + 3, 2, 30 * s, 6);
    const grd = ctx.createLinearGradient(-15 * s, 0, 15 * s, 0);
    grd.addColorStop(0, '#9aa0c8'); grd.addColorStop(0.45, '#ffffff'); grd.addColorStop(1, '#8c90b8');
    ctx.fillStyle = grd; ctx.fillRect(-15 * s, -3, 30 * s, 6);
    ctx.strokeStyle = g.hexA(EL.arcane, 0.95); ctx.lineWidth = 1.8; ctx.strokeRect(-15 * s, -3, 30 * s, 6);
    ctx.restore();
  }
  // A fallen ally: lying flat and grey with their spirit hovering; `up` 0..1 stands them up.
  function downed(g, x, y, col, up) {
    const { ctx, lerp, TAU } = g, k = g.clamp(up);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, lerp(0.55, 1, k));
    g.wizard(0, 0, { color: g.mix(col, '#575269', (1 - k) * 0.75), facing: lerp(2.5, -0.4, k), alpha: lerp(0.8, 1, k) });
    ctx.restore();
    if (k < 1) {
      const gy = y - 30 + Math.sin(g.t * 3) * 3 + k * 26;
      ctx.save(); ctx.globalAlpha = 0.75 * (1 - k);
      ctx.fillStyle = '#e8f6ff'; ctx.beginPath();
      ctx.arc(x, gy, 7, Math.PI, 0);
      for (let i = 0; i <= 4; i++) ctx.lineTo(x + 7 - i * 3.5, gy + 8 + (i % 2 ? -2 : 1) + Math.sin(g.t * 6 + i) * 1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a1030';
      ctx.beginPath(); ctx.arc(x - 2.5, gy - 1, 1.3, 0, TAU); ctx.arc(x + 2.5, gy - 1, 1.3, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // ---------- 1. Clothesline ----------
  SG.register({
    id: 'clothesline-magick',
    name: 'Clothesline',
    family: 'control',
    status: 'magick',
    oneLiner: 'Each caster is an anchor of a crackling line. Walk together to sweep it through a wave.',
    situation: 'A wave rushes through the gap between two well placed players.',
    coop: 'One opens the Magick, the other joins. Then you walk in step.',
    source: 'Co-op Magick: two casters',
    duration: 6.6,
    floor: 'meadow',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR, TAU } = g;
      const SEQ = ['lightning', 'shield', 'lightning'], C = EL.lightning;
      const W0 = 2.5, W1 = 5.1, X0 = 60, X1 = 300, hy = 62, ay = 210, L0 = J + 0.1, L1 = J + 0.45, OFF = 5.6;
      const lineX = (tt) => lerp(X0, X1, ease.inOut(seg(tt, W0, W1)));
      const lx = lineX(t), walking = t > W0 && t < W1;
      const reach = ease.out(seg(t, L0, L1)), la = 1 - seg(t, OFF, OFF + 0.4);

      // The wave.
      const V = 44, wave = [[300, 92], [318, 160], [336, 120], [352, 186], [370, 82], [382, 140], [396, 178], [408, 108]];
      wave.forEach(([x0, y], i) => {
        const ex = (tt) => x0 - V * Math.max(0, tt - 0.6);
        let trip = Infinity;
        for (let tt = L1; tt < OFF; tt += 0.02) if (ex(tt) <= lineX(tt) + 8) { trip = tt; break; }
        const age = t - trip, x = ex(Math.min(t, trip));
        const brute = i === 3, col = brute ? ACTOR.brute : i === 5 ? ACTOR.imp : ACTOR.enemy, r = brute ? 11 : 8;
        if (age < 0) {
          g.enemy(x, y + Math.sin(t * 12 + i) * 1.5, { color: col, r, facing: Math.PI });
        } else {
          const flip = ease.out(seg(age, 0, 0.3));
          ctx.save(); ctx.translate(x + flip * 6, y + flip * 3);
          ctx.rotate(flip * Math.PI * 0.5); ctx.scale(1, 1 - 0.4 * flip);
          g.enemy(0, 0, { color: col, r, facing: Math.PI, hit: Math.max(0, 1 - age * 3), status: age < 0.8 ? 'shocked' : [] });
          ctx.restore();
          if (age > 0.3) for (let k = 0; k < 3; k++) {
            const a = t * 5 + k * TAU / 3;
            ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x + 6 + Math.cos(a) * 7, y - 8 + Math.sin(a) * 2, 1.5, 0, TAU); ctx.fill();
          }
          g.burst(x, y, age, { seed: 60 + i, count: 8, colors: [C, EL.shield], speed: 50, life: 0.35, size: 2 });
          if (i % 2 === 0) g.popup('-40', x, y - 16, age - 0.05);
        }
      });

      // The line.
      if (t >= L0 && la > 0) {
        const y2 = lerp(hy + 10, ay - 10, reach);
        g.glow(lx, (hy + y2) / 2, 60, C, 0.18 * la);
        for (let k = 0; k < 2; k++) g.bolt(lx, hy + 10, lx, y2, { seed: Math.floor(t * 18) + k * 7, color: k ? EL.shield : C, width: k ? 1.5 : 2.6, alpha: la, jag: 6 });
        if (reach < 1) g.glow(lx, y2, 14, '#ffffff', 0.9);
      }

      // Anchors walk in step.
      const b = bob(g, walking);
      g.wizard(lx - 2, hy + b, { facing: walking ? 0.6 : Math.PI / 2, tip: C, casting: castPulse(g, O) + (t >= L0 && t < OFF ? 0.4 : 0) });
      g.wizard(lx - 2, ay + b, { color: ACTOR.ally, facing: walking ? -0.6 : -Math.PI / 2, tip: C, casting: castPulse(g, J) + (t >= L0 && t < OFF ? 0.4 : 0) });
      openJoin(g, [lx - 2, hy], [lx - 2, ay], SEQ, C);
      tag(g, 'anchor', lx - 38, hy, 2.6, 4.3, C);
      tag(g, 'anchor', lx - 38, ay, 2.6, 4.3, ACTOR.ally);
      tag(g, 'wave', 350, 36, 0.3, 1.6, '#ff9a8a');
    },
  });

  // ---------- 2. Resurrect rite ----------
  SG.register({
    id: 'resurrect-rite',
    name: 'Resurrect Rite',
    family: 'support',
    status: 'magick',
    oneLiner: 'One player kneels and channels over a fallen friend while the other keeps enemies off them.',
    situation: 'A friend is down mid-wave and waiting for the wave to end costs too much.',
    coop: 'The channeler is rooted and can be interrupted. The guard makes sure they are not.',
    source: 'Co-op Magick: two casters',
    duration: 7,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR, TAU } = g;
      const SEQ = ['life', 'arcane', 'life'], C = EL.life;
      const F = [158, 152], H = [100, 116], G = [236, 136];
      const CH0 = J + 0.25, CH1 = 5.2, prog = seg(t, CH0, CH1), up = ease.back(seg(t, CH1, CH1 + 0.45));
      const chan = t >= CH0 && t < CH1;

      // Rooted rune under the channeler.
      if (t >= CH0 - 0.1 && t < CH1 + 0.35) g.rune(H[0], H[1] + 3, 17, { color: C, alpha: 0.85 * seg(t, CH0 - 0.1, CH0 + 0.2) * (1 - seg(t, CH1, CH1 + 0.35)), spin: 1.2, armed: 0.6 });

      // Fallen friend.
      downed(g, F[0], F[1], ACTOR.ally2, up);
      hpBar(g, F[0], F[1] + 15, 0.5 * g.clamp(up), { alpha: 0.9 });
      if (prog > 0 && t < CH1 + 0.3) {
        ctx.save(); ctx.globalAlpha = 1 - seg(t, CH1, CH1 + 0.3);
        ctx.strokeStyle = 'rgba(10,6,20,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(F[0], F[1], 21, 0, TAU); ctx.stroke();
        ctx.strokeStyle = C; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(F[0], F[1], 21, -Math.PI / 2, -Math.PI / 2 + TAU * prog); ctx.stroke();
        ctx.restore();
      }
      g.burst(F[0], F[1], t - CH1, { seed: 5, count: 26, colors: [C, '#ffffff'], speed: 90, life: 0.6, size: 2.5 });
      g.ring(F[0], F[1], 12 + 40 * seg(t, CH1, CH1 + 0.5), { color: C, alpha: t >= CH1 ? 1 - seg(t, CH1, CH1 + 0.5) : 0, width: 3 });
      tag(g, 'down', F[0], F[1] + 30, 0.2, O, '#c8c2d8');
      tag(g, 'back up!', F[0], F[1] - 30, CH1 + 0.2, CH1 + 1.3, C, 10);

      // Channeler.
      const hf = g.angle(H[0], H[1], F[0], F[1]);
      g.wizard(H[0], H[1], { facing: hf, tip: C, casting: castPulse(g, O) + (chan ? 0.6 + 0.3 * Math.sin(t * 9) : 0) });
      if (chan) {
        const [sx, sy] = staffTip(H[0], H[1], hf, 1), a = seg(t, CH0, CH0 + 0.2);
        g.beam(sx, sy, F[0], F[1] - 4, { color: C, width: 3, alpha: 0.7 * a });
        for (let i = 0; i < 3; i++) {
          const p = (t * 1.6 + i / 3) % 1;
          g.orb(lerp(sx, F[0], p), lerp(sy, F[1] - 4, p) - Math.sin(p * Math.PI) * 6, 2.4, C, { alpha: a });
        }
      }

      // Enemies rush in; the guard knocks each one back.
      const foes = [[92, ACTOR.enemy, 9], [146, ACTOR.brute, 12], [196, ACTOR.enemy, 9]];
      let target = null;
      foes.forEach(([y, col, r], i) => {
        const s = 1.4 + i * 0.85, hit = s + 1.55, sh = hit - 0.3;
        const ex = (tt) => 420 - 88 * Math.max(0, tt - s);
        if (t < hit) {
          if (target === null && t >= J) target = [ex(hit), y, sh];
          g.enemy(ex(t), y + Math.sin(t * 13 + i) * 1.5, { color: col, r, facing: g.angle(ex(t), y, H[0], H[1]) });
        } else {
          const fp = seg(t, hit, hit + 0.5), x0 = ex(hit);
          const [px, py, gy] = toss(x0, y, x0 + 46, y, 18, ease.out(fp));
          if (fp < 1) groundShadow(g, px, gy, r * 0.8, 0.7);
          g.enemy(px, py, { color: col, r, facing: Math.PI + t * 10 * (1 - fp), status: 'burning', hit: Math.max(0, 1 - (t - hit) * 3), hp: 1 - seg(t, hit, hit + 0.3), dead: seg(t, hit + 0.8, hit + 1.2) });
          g.popup('-120', px, py - r - 8, t - hit - 0.05);
        }
        // Guard's fireball.
        const fp = seg(t, sh, hit);
        if (fp > 0 && fp < 1) {
          const gf = g.angle(G[0], G[1], ex(hit), y), [tx, ty] = staffTip(G[0], G[1], gf, 1);
          const pos = (tt) => { const q = seg(tt, sh, hit); return [lerp(tx, ex(hit), q), lerp(ty, y, q)]; };
          g.trail(pos, { color: EL.fire, len: 0.1, width: 4, from: sh });
          g.orb(...pos(t), 4.5, EL.fire);
        }
        g.explosion(ex(hit), y, t - hit, { color: EL.fire, r: 20, count: 14, seed: i + 3 });
      });

      // Guard.
      const gf = target ? g.angle(G[0], G[1], target[0], target[1]) : 0;
      const shotNow = target ? seg(t, target[2] - 0.2, target[2]) * (1 - seg(t, target[2] + 0.1, target[2] + 0.3)) : 0;
      g.wizard(G[0], G[1], { color: ACTOR.ally, facing: gf, tip: t >= J + 0.3 ? EL.fire : C, casting: Math.max(castPulse(g, J), shotNow) });
      openJoin(g, H, G, SEQ, C, { dx1: -34 });
      tag(g, 'channel', H[0], H[1] - 30, 2.5, 4.4, C);
      tag(g, 'guard', G[0], G[1] + 24, 2.5, 4.4, ACTOR.ally);
    },
  });

  // ---------- 3. Comet call ----------
  SG.register({
    id: 'comet-call',
    name: 'Comet Call',
    family: 'offense',
    status: 'magick',
    oneLiner: 'The caller channels a comet. It lands wherever the spotter is aiming when the channel ends.',
    situation: 'A big pack in the open, especially a brute with swarmers.',
    coop: 'Spotting is the easy half: a newcomer just keeps the reticle on the pack.',
    source: 'Co-op Magick: two casters',
    duration: 7,
    floor: 'sand',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR, TAU, rand } = g;
      const SEQ = ['earth', 'fire', 'earth'], C = EL.fire;
      const Hc = [64, 74], Sp = [72, 204], CH0 = J + 0.25, IMP = 4.7;
      const pack = (tt) => [lerp(318, 262, seg(tt, 1.0, IMP)), lerp(100, 146, seg(tt, 1.0, IMP))];
      const R = (tt) => {
        const [px, py] = pack(tt - 0.25), k = ease.inOut(seg(tt, J, J + 0.7));
        return [lerp(170, px, k), lerp(196, py, k)];
      };
      const [Tx, Ty] = R(Math.min(t, IMP));
      const [sx, sy] = shake(g, IMP, 6, 0.5);
      ctx.save(); ctx.translate(sx, sy);

      // Crater.
      const cr = seg(t, IMP, IMP + 0.2) * (1 - seg(t, 6.2, 6.8));
      if (cr > 0) {
        ctx.save(); ctx.globalAlpha = cr;
        ctx.fillStyle = 'rgba(40,22,14,0.7)'; ctx.beginPath(); ctx.ellipse(Tx, Ty, 36, 22, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(30,16,10,0.8)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
        g.glow(Tx, Ty, 34, C, 0.5 * cr * (1 - seg(t, IMP, 6.4)));
      }

      // Reticle held by the spotter.
      if (t >= J && t < IMP) {
        const a = seg(t, J, J + 0.2), prog = seg(t, CH0, IMP), rr = 38 - 8 * prog;
        const sf = g.angle(Sp[0], Sp[1], Tx, Ty), [ax, ay] = staffTip(Sp[0], Sp[1], sf, 0.3);
        g.aim(ax, ay, Tx, Ty, { color: C, alpha: 0.45 * a });
        ctx.save(); ctx.globalAlpha = a;
        g.ring(Tx, Ty, rr, { color: C, width: 2, dash: [6, 5], alpha: 0.8 });
        ctx.restore();
        g.cursor(Tx, Ty, { alpha: 0.95 * a });
      }

      // The pack.
      const mem = [[0, 0, ACTOR.brute, 13], [-30, -18, ACTOR.enemy, 8], [26, -24, ACTOR.enemy, 8], [-26, 22, ACTOR.imp, 8], [30, 18, ACTOR.enemy, 8], [2, -38, ACTOR.enemy, 8]];
      mem.forEach(([ox, oy, col, r], i) => {
        const [px, py] = pack(Math.min(t, IMP));
        const x = px + ox + Math.sin(t * 2 + i * 1.7) * 3, y = py + oy + Math.cos(t * 2.4 + i) * 2;
        if (t < IMP) {
          g.enemy(x, y, { color: col, r, facing: g.angle(x, y, Sp[0], Sp[1]) });
        } else {
          const out = g.angle(Tx, Ty, x, y) + (i === 0 ? 0 : 0), d = i === 0 ? 30 : 64 + rand(i, 3) * 20;
          const fp = seg(t, IMP, IMP + 0.75);
          const [qx, qy, gy] = toss(x, y, x + Math.cos(i === 0 ? 0.3 : out) * d, y + Math.sin(i === 0 ? 0.3 : out) * d * 0.7, 44, ease.out(fp));
          if (fp < 1) groundShadow(g, qx, gy, r * 0.8, 0.7);
          g.enemy(qx, qy, { color: col, r, facing: t * 10 * (1 - fp), status: 'burning', hit: Math.max(0, 1 - (t - IMP) * 3), hp: 1 - seg(t, IMP, IMP + 0.3), dead: seg(t, IMP + 1.1, IMP + 1.6) });
          g.popup(i === 0 ? '-300' : '-150', qx, qy - r - 8, t - IMP - 0.25, { size: i === 0 ? 11 : 9 });
        }
      });

      // The comet.
      const cp = seg(t, IMP - 1.3, IMP);
      if (cp > 0 && cp < 1) {
        const pos = (tt) => { const [rx, ry] = R(Math.min(tt, IMP)), q = ease.in(seg(tt, IMP - 1.3, IMP)); return [rx + 170 * (1 - q), ry - 250 * (1 - q)]; };
        groundShadow(g, Tx, Ty, 6 + 20 * cp, 0.3 + 0.6 * cp);
        g.trail(pos, { color: C, len: 0.3, width: 12 * (0.5 + cp), from: IMP - 1.3 });
        const [x, y] = pos(t);
        g.glow(x, y, 30 + 20 * cp, C, 0.8);
        g.rock(x, y, 7 + 6 * cp, { rot: t * 6, color: '#8a5a3a' });
      }
      g.explosion(Tx, Ty, t - IMP, { color: C, r: 90, count: 50, colors: [C, EL.earth, '#ffd166', '#ffffff'] });
      g.burst(Tx, Ty, t - IMP, { seed: 31, count: 14, color: EL.earth, speed: 160, life: 0.8, size: 3.5, gravity: 60 });
      if (t >= IMP && t < IMP + 0.3) g.glow(200, 130, 280, '#ffffff', 0.25 * (1 - seg(t, IMP, IMP + 0.3)));

      // Caller channels toward the sky.
      const chan = t >= CH0 && t < IMP;
      const hf = chan ? -0.9 : g.angle(Hc[0], Hc[1], 260, 120);
      g.wizard(Hc[0], Hc[1], { facing: hf, tip: C, casting: castPulse(g, O) + (chan ? 0.7 + 0.3 * Math.sin(t * 10) : 0) });
      if (chan) {
        const [tx, ty] = staffTip(Hc[0], Hc[1], hf, 1);
        g.glow(tx, ty, 14 + 10 * seg(t, CH0, IMP), C, 0.7);
        ctx.strokeStyle = 'rgba(10,6,20,0.6)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(Hc[0], Hc[1], 17, 0, TAU); ctx.stroke();
        ctx.strokeStyle = C; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(Hc[0], Hc[1], 17, -Math.PI / 2, -Math.PI / 2 + TAU * seg(t, CH0, IMP)); ctx.stroke();
      }
      // Spotter.
      g.wizard(Sp[0], Sp[1], { color: ACTOR.ally, facing: t >= J ? g.angle(Sp[0], Sp[1], Tx, Ty) : -0.4, tip: C, casting: castPulse(g, J) });
      openJoin(g, Hc, Sp, SEQ, C);
      tag(g, 'caller', Hc[0] + 44, Hc[1], 2.5, 4.4, C);
      tag(g, 'spotter', Sp[0] + 48, Sp[1], 2.5, 4.4, ACTOR.ally);
      ctx.restore();
    },
  });

  // ---------- 4. Mirror pair ----------
  SG.register({
    id: 'mirror-pair',
    name: 'Mirror Pair',
    family: 'offense',
    status: 'magick',
    oneLiner: 'Each caster raises a mirror. A beam fired into one bounces to the other and out where it aims.',
    situation: 'A back-line caster hides behind cover and keeps hurting you.',
    coop: 'One player fires the beam, the other places the far mirror and aims it.',
    source: 'Co-op Magick: two casters',
    duration: 6.6,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const SEQ = ['shield', 'arcane', 'shield'], C = EL.arcane;
      const Hh = [56, 150], Al = [150, 222], A = [118, 52], B = [300, 34], E = [338, 150];
      const FIRE = 2.9, HIT = FIRE + 0.4, END = 4.4;
      const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
      const nrm = (p, a, b) => { const u = unit(a[0] - p[0], a[1] - p[1]), v = unit(b[0] - p[0], b[1] - p[1]); return Math.atan2(u[1] + v[1], u[0] + v[0]); };
      const hf = t < 0.4 ? 0 : g.angle(Hh[0], Hh[1], A[0], A[1]);
      const [tx, ty] = staffTip(Hh[0], Hh[1], hf, 1);

      g.wall(236, 72, 16, 148);
      tag(g, 'cover', 244, 60, 0.2, 1.0, '#d8d4e8');

      // Back-line caster.
      const dead = seg(t, HIT + 1.1, HIT + 1.5), hitOn = t >= HIT && t < END;
      g.enemy(E[0] + (hitOn ? Math.sin(t * 50) * 1.2 : 0), E[1], { color: ACTOR.imp, r: 10, facing: hitOn ? -1.8 : Math.PI, hit: hitOn ? 0.4 + 0.3 * Math.sin(t * 30) : 0, hp: 1 - seg(t, HIT, HIT + 1.0), dead });
      if (t < HIT) for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; g.orb(E[0] + Math.cos(a) * 15, E[1] + Math.sin(a) * 6 - 4, 1.8, C); }
      tag(g, 'caster', E[0], E[1] - 26, 0.2, 1.6, '#d5b8ff');
      [0, 0.4, 0.8].forEach((d, k) => g.popup('-60', E[0] + (k - 1) * 10, E[1] - 20, t - HIT - d));

      // Mirrors.
      const fade = 1 - seg(t, 5.3, 5.8), hot = t >= FIRE && t < END ? 1 : 0;
      mirror(g, A[0], A[1], nrm(A, Hh, B), ease.back(seg(t, O, O + 0.3)), fade, hot);
      mirror(g, B[0], B[1], nrm(B, A, E), ease.back(seg(t, J, J + 0.3)), fade, hot);
      g.burst(A[0], A[1], t - O, { seed: 3, count: 12, colors: [C, '#ffffff'], speed: 45, life: 0.4, size: 2 });
      g.burst(B[0], B[1], t - J, { seed: 4, count: 12, colors: [C, '#ffffff'], speed: 45, life: 0.4, size: 2 });

      // Cursors: hero places mirror 1, ally places mirror 2 then aims at the caster.
      const c1 = ease.inOut(seg(t, 0.45, 0.95));
      if (t >= 0.45 && t < 1.4) g.cursor(lerp(110, A[0], c1), lerp(120, A[1], c1), { alpha: 0.9 * (1 - seg(t, 1.1, 1.4)) });
      const c2 = ease.inOut(seg(t, 1.35, 1.85)), c3 = ease.inOut(seg(t, 2.1, 2.6));
      if (t >= 1.35 && t < 3.6) {
        const cx = t < 2.1 ? lerp(210, B[0], c2) : lerp(B[0], E[0], c3), cy = t < 2.1 ? lerp(170, B[1], c2) : lerp(B[1], E[1], c3);
        g.cursor(cx, cy, { color: ACTOR.ally, alpha: 0.95 * (1 - seg(t, 3.3, 3.6)) });
        if (t >= 2.1) g.aim(B[0], B[1], cx, cy, { color: ACTOR.ally, alpha: 0.6 * (1 - seg(t, FIRE + 0.2, FIRE + 0.4)) });
      }

      // The beam: hero -> mirror 1 -> mirror 2 -> caster.
      if (t >= FIRE && t < END) {
        const a = 1 - seg(t, END - 0.25, END);
        const legs = [[[tx, ty], A, FIRE], [A, B, FIRE + 0.13], [B, E, FIRE + 0.26]];
        legs.forEach(([p, q, s]) => {
          const r = ease.out(seg(t, s, s + 0.13)); if (r <= 0) return;
          const x2 = lerp(p[0], q[0], r), y2 = lerp(p[1], q[1], r);
          g.beam(p[0], p[1], x2, y2, { color: C, width: 5, alpha: a });
        });
      }
      g.burst(A[0], A[1], t - FIRE - 0.13, { seed: 7, count: 12, colors: [C, '#ffffff'], speed: 60, life: 0.35, size: 2 });
      g.burst(B[0], B[1], t - FIRE - 0.26, { seed: 8, count: 12, colors: [C, '#ffffff'], speed: 60, life: 0.35, size: 2 });
      g.explosion(E[0], E[1], t - HIT - 1.1, { color: C, r: 26, count: 18 });

      // Casters.
      const firing = t >= FIRE && t < END;
      g.wizard(Hh[0], Hh[1], { facing: hf, tip: C, casting: castPulse(g, O) + (firing ? 1 : 0) });
      const af = t < 1.3 ? -1.2 : g.angle(Al[0], Al[1], B[0], B[1]);
      g.wizard(Al[0], Al[1], { color: ACTOR.ally, facing: af, tip: C, casting: castPulse(g, J) + (firing ? 0.4 : 0) });
      openJoin(g, Hh, Al, SEQ, C);
      tag(g, 'fires', Hh[0], Hh[1] + 24, 2.6, 4.0, C);
      tag(g, 'aims', Al[0] + 34, Al[1], 2.2, 4.0, ACTOR.ally);
    },
  });

  // ---------- 5. Shared ward ----------
  SG.register({
    id: 'shared-ward',
    name: 'Shared Ward',
    family: 'support',
    status: 'magick',
    oneLiner: 'A tether links two players. Hits on either are split between both, until they drift too far apart.',
    situation: 'A fragile newcomer keeps getting focused by enemy fire.',
    coop: 'The veteran tanks half of every hit the newcomer takes.',
    source: 'Co-op Magick: two casters',
    duration: 7,
    floor: 'meadow',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR } = g;
      const SEQ = ['shield', 'life', 'shield'], C = EL.shield;
      const V = [112, 100], N0 = [176, 164], N1 = [272, 204], D0 = 4.0, D1 = 4.9, TL0 = J + 0.1;
      const Np = (tt) => { const k = ease.inOut(seg(tt, D0, D1)); return [lerp(N0[0], N1[0], k), lerp(N0[1], N1[1], k)]; };
      let SNAP = 99;
      for (let tt = D0; tt < D1 + 0.01; tt += 0.02) { const [x, y] = Np(tt); if (g.dist(V[0], V[1], x, y) > 150) { SNAP = tt; break; } }
      const N = Np(t), d = g.dist(V[0], V[1], N[0], N[1]);
      const foes = [[346, 92], [352, 186]];
      const shots = [[2.7, 0], [3.5, 1], [5.3, 0]].map(([s, f]) => ({ s, f, h: s + 0.45 }));

      // Tether.
      const linked = t >= TL0 && t < SNAP;
      if (linked) {
        const reach = ease.out(seg(t, TL0, TL0 + 0.35)), st = seg(d, 100, 150);
        const col = g.mix(C, EL.fire, st), flick = st > 0.6 ? 0.6 + 0.4 * Math.sin(t * 60) : 1;
        const ex = lerp(V[0], N[0], reach), ey = lerp(V[1], N[1], reach);
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const p = i / 16;
          pts.push([lerp(V[0], ex, p), lerp(V[1], ey, p) + Math.sin(p * Math.PI) * 10 * (1 - st) + Math.sin(t * 10 + i) * 2 * st]);
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const [w, a] of [[8 - 4 * st, 0.25], [3 - st, 0.9]]) {
          ctx.strokeStyle = g.hexA(col, a * flick); ctx.lineWidth = w;
          ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.stroke();
        }
        ctx.restore();
        for (let i = 0; i < 3; i++) { const p = (t * 0.8 + i / 3) % 1, q = pts[Math.round(p * 16)]; if (p < reach) g.orb(q[0], q[1], 1.8, col); }
      }
      if (t >= SNAP && t < SNAP + 0.45) {
        const k = ease.out(seg(t, SNAP, SNAP + 0.45)), mx = (V[0] + N[0]) / 2, my = (V[1] + N[1]) / 2;
        ctx.save(); ctx.globalAlpha = 1 - k; ctx.strokeStyle = EL.fire; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(V[0], V[1]); ctx.lineTo(lerp(mx, V[0], k), lerp(my, V[1], k) + 10 * k); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(N[0], N[1]); ctx.lineTo(lerp(mx, N[0], k), lerp(my, N[1], k) + 10 * k); ctx.stroke();
        ctx.restore();
      }
      g.burst((V[0] + Np(SNAP)[0]) / 2, (V[1] + Np(SNAP)[1]) / 2, t - SNAP, { seed: 9, count: 16, colors: [EL.fire, C, '#ffffff'], speed: 70, life: 0.45, size: 2 });

      // Enemy shots at the newcomer.
      shots.forEach(({ s, f, h }, k) => {
        const [fx, fy] = foes[f], [nx, ny] = Np(h), sp = seg(t, s, h);
        if (sp > 0 && sp < 1) {
          const pos = (tt) => { const q = seg(tt, s, h); return [lerp(fx, nx, q), lerp(fy, ny, q)]; };
          g.trail(pos, { color: EL.arcane, len: 0.12, width: 4, from: s });
          g.orb(...pos(t), 4, EL.arcane);
        }
        g.burst(nx, ny, t - h, { seed: 20 + k, count: 12, colors: [EL.arcane, '#ffffff'], speed: 50, life: 0.35, size: 2 });
        const split = h < SNAP;
        g.popup(split ? '-20' : '-40', nx, ny - 20, t - h, { size: split ? 9 : 12, color: split ? '#ffd166' : '#ff6b6b' });
        if (split) {
          g.popup('-20', V[0], V[1] - 20, t - h - 0.25);
          const pp = seg(t, h, h + 0.25);
          if (pp > 0 && pp < 1) g.orb(lerp(nx, V[0], pp), lerp(ny, V[1], pp) + Math.sin(pp * Math.PI) * 10, 3, C);
        }
      });
      foes.forEach(([x, y], i) => {
        const fire = shots.some(({ s, f }) => f === i && t >= s - 0.2 && t < s + 0.1);
        g.enemy(x + Math.sin(t * 3 + i) * 1.5 + (fire ? -2 : 0), y, { color: ACTOR.imp, r: 9, facing: g.angle(x, y, N[0], N[1]) });
      });

      // HP.
      const hh = shots.map(({ h }) => seg(t, h, h + 0.2));
      const hpN = 1 - 0.2 * hh[0] - 0.2 * hh[1] - 0.4 * hh[2];
      const hpV = 1 - 0.12 * hh[0] - 0.12 * hh[1];

      // The two players.
      const walking = t > D0 && t < D1;
      g.wizard(V[0], V[1], { facing: linked ? g.angle(V[0], V[1], N[0], N[1]) : 0.3, tip: C, casting: castPulse(g, O) + (linked ? 0.3 : 0), scale: 1.1 });
      g.wizard(N[0], N[1] + bob(g, walking), { color: ACTOR.ally2, facing: walking ? 0.4 : g.angle(N[0], N[1], foes[0][0], foes[0][1]), tip: C, casting: castPulse(g, J), scale: 0.85 });
      hpBar(g, V[0], V[1] + 15, hpV);
      hpBar(g, N[0], N[1] + 13, hpN, { w: 16 });
      openJoin(g, V, N, SEQ, C);
      tag(g, 'veteran', V[0] - 40, V[1], 2.4, 3.3, C);
      tag(g, 'newcomer', N[0] - 46, N[1], 2.4, 3.3, ACTOR.ally2);
      tag(g, 'split', (V[0] + N[0]) / 2 + 22, (V[1] + N[1]) / 2 - 4, 3.2, 4.2, C);
      tag(g, 'too far: snap!', (V[0] + N[0]) / 2 + 24, (V[1] + N[1]) / 2 + 20, SNAP, SNAP + 1.1, EL.fire);
    },
  });

  // ---------- 6. Ward bridge ----------
  SG.register({
    id: 'ward-bridge',
    name: 'Ward Bridge',
    family: 'control',
    status: 'magick',
    oneLiner: 'Each player places one end and a shield bridge forms between them. Allies cross, enemies cannot.',
    situation: 'A chasm blocks the way and a pack is chasing you.',
    coop: 'Two players pick the two ends. Great for puzzles or splitting a room.',
    source: 'Co-op Magick: two casters',
    duration: 6.8,
    floor: 'stone',
    draw(g, t) {
      const { ctx, seg, ease, lerp, EL, ACTOR, rand } = g;
      const SEQ = ['shield', 'earth', 'shield'], C = EL.shield;
      const L = [150, 130], R = [250, 130], Hp0 = [96, 78], Ap0 = [92, 192];
      const B0 = J + 0.1, B1 = J + 0.55, WK0 = 2.6, WK1 = 4.6, OFF = 6.0;
      const by0 = 113, by1 = 147, CX0 = 162, CX1 = 238;

      // Chasm.
      ctx.fillStyle = '#0d0918';
      ctx.beginPath(); ctx.moveTo(CX0, -2);
      for (let y = 0; y <= 262; y += 13) ctx.lineTo(CX0 + (rand(y, 1) - 0.5) * 8, y);
      for (let y = 262; y >= 0; y -= 13) ctx.lineTo(CX1 + (rand(y, 2) - 0.5) * 8, y);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(160,150,190,0.35)'; ctx.lineWidth = 2; ctx.stroke();
      const grd = ctx.createLinearGradient(CX0, 0, CX1, 0);
      grd.addColorStop(0, 'rgba(60,40,100,0.25)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(60,40,100,0.25)');
      ctx.fillStyle = grd; ctx.fillRect(CX0 - 4, 0, CX1 - CX0 + 8, 260);

      // Goal on the far side.
      g.glow(352, 132, 30, C, 0.2 + 0.08 * Math.sin(t * 4));

      // End posts.
      const fade = 1 - seg(t, OFF, OFF + 0.5);
      const post = (p, s) => { if (s > 0 && fade > 0) { g.rune(p[0], p[1], 14 * ease.back(s), { color: C, alpha: 0.9 * fade, spin: 1, armed: 0.7 * fade }); } };
      post(L, seg(t, O, O + 0.3)); post(R, seg(t, J, J + 0.3));
      g.burst(L[0], L[1], t - O, { seed: 1, count: 12, color: C, speed: 45, life: 0.4, size: 2 });
      g.burst(R[0], R[1], t - J, { seed: 2, count: 12, color: C, speed: 45, life: 0.4, size: 2 });

      // Bridge grows from both ends and meets in the middle.
      const k = ease.inOut(seg(t, B0, B1)), mid = (L[0] + R[0]) / 2;
      if (k > 0 && fade > 0) {
        const xa = L[0], xb = lerp(L[0], mid, k), xc = lerp(R[0], mid, k), xd = R[0];
        ctx.save(); ctx.globalAlpha = fade;
        for (const [x1, x2] of [[xa, xb], [xc, xd]]) {
          if (Math.abs(x2 - x1) < 1) continue;
          const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
          ctx.fillStyle = g.hexA(C, 0.28); ctx.fillRect(lo, by0, hi - lo, by1 - by0);
          ctx.strokeStyle = g.hexA(C, 0.5); ctx.lineWidth = 1;
          for (let x = L[0] + 8; x < R[0]; x += 10) if (x > lo && x < hi) { ctx.beginPath(); ctx.moveTo(x, by0 + 2); ctx.lineTo(x, by1 - 2); ctx.stroke(); }
          g.barrier(lo, by0, hi, by0, { color: C, thick: 3 });
          g.barrier(lo, by1, hi, by1, { color: C, thick: 3 });
        }
        ctx.restore();
        if (k < 1) { g.glow(xb, 130, 16, '#ffffff', 0.8); g.glow(xc, 130, 16, '#ffffff', 0.8); }
      }
      g.burst(mid, 130, t - B1, { seed: 6, count: 20, colors: [C, '#ffffff'], speed: 70, life: 0.45, size: 2.2 });

      // Chasers bounce off the bridge mouth.
      const foes = [[118, ACTOR.enemy, 9], [131, ACTOR.brute, 11], [144, ACTOR.enemy, 9]];
      let bump = 0;
      foes.forEach(([y, col, r], i) => {
        const s = 3.0 + i * 0.14, hit = s + 0.95, x1 = L[0] - r - 2;
        if (t < s) return;
        if (t < hit) {
          const x = lerp(-20, x1, seg(t, s, hit));
          g.enemy(x, y + Math.sin(t * 16 + i) * 2, { color: col, r, facing: 0 });
        } else {
          const fp = seg(t, hit, hit + 0.55);
          const [px, py, gy] = toss(x1, y, x1 - 46 - i * 6, y + (i - 1) * 26, 20, ease.out(fp));
          if (fp < 1) groundShadow(g, px, gy, r * 0.8, 0.7);
          g.enemy(px, py, { color: col, r, facing: t * 9 * (1 - fp), hit: Math.max(0, 1 - (t - hit) * 3), status: fp > 0.5 ? 'stunned' : [] });
          if (t - hit < 0.35) bump = Math.max(bump, 1 - (t - hit) / 0.35);
        }
      });
      if (bump > 0) g.barrier(L[0], by0, L[0], by1, { color: '#ffffff', thick: 4, alpha: bump });
      tag(g, 'blocked', 90, 96, 4.0, 5.0, '#ff9a8a');

      // Players walk across.
      const hpath = [Hp0, [146, 122], [254, 122], [330, 104]], apath = [Ap0, [146, 140], [254, 140], [326, 168]];
      const hw = ease.inOut(seg(t, WK0, WK1)), aw = ease.inOut(seg(t, WK0 + 0.15, WK1 + 0.15));
      const [hx, hy, ha] = g.along(hpath, hw), [ax, ay, aa] = g.along(apath, aw);
      const back = t > WK1 + 0.2;
      g.wizard(hx, hy + bob(g, hw > 0 && hw < 1), { facing: hw > 0 && !back ? ha : back ? Math.PI : g.angle(Hp0[0], Hp0[1], L[0], L[1]), tip: C, casting: castPulse(g, O) });
      g.wizard(ax, ay + bob(g, aw > 0 && aw < 1), { color: ACTOR.ally, facing: aw > 0 && !back ? aa : back ? Math.PI : g.angle(Ap0[0], Ap0[1], R[0], R[1]), tip: C, casting: castPulse(g, J) });

      // Cursors placing the ends.
      const c1 = ease.inOut(seg(t, 0.45, 0.95)), c2 = ease.inOut(seg(t, 1.35, 1.85));
      if (t >= 0.45 && t < 1.4) g.cursor(lerp(120, L[0], c1), lerp(100, L[1], c1), { alpha: 0.9 * (1 - seg(t, 1.1, 1.4)) });
      if (t >= 1.35 && t < 2.3) g.cursor(lerp(150, R[0], c2), lerp(180, R[1], c2), { color: ACTOR.ally, alpha: 0.9 * (1 - seg(t, 2.0, 2.3)) });

      openJoin(g, [Hp0[0], Hp0[1]], [Ap0[0], Ap0[1]], SEQ, C, { end: J + 0.7 });
      tag(g, 'end 1', L[0], L[1] - 30, 2.5, 3.4, C);
      tag(g, 'end 2', R[0], R[1] - 30, 2.5, 3.4, ACTOR.ally);
    },
  });
})();
