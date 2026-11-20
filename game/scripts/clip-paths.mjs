// Where a clip moves the body: hands, elbows, shoulders, head and hips in the body's own frame, sampled through the clip.
// Usage: node scripts/clip-paths.mjs <file.glb> [clip name] [--step 0.05] [--from 0] [--to end] [--svg out.svg]
// Prints each joint as fwd/up/side (model units: fwd along the rest pose's facing, side to the body's right) and, for a
// thrust, the line through both hands (its angle off forward, in the ground plane and up/down) and the lead hand's travel
// along forward. --svg writes a side view (fwd x up) and a top view (fwd x side) of the stick figure, one per sample, so a
// motion can be judged from the side instead of only from the game's high camera.
import { readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!pos[0]) { console.error('usage: node scripts/clip-paths.mjs <file.glb> [clip] [--step s] [--from s] [--to s] [--svg out.svg]'); process.exit(1); }
globalThis.self ??= globalThis;
const buf = readFileSync(pos[0]);
const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', res, rej));
const clips = gltf.animations;
const clip = pos[1] ? clips.find((c) => c.name === pos[1]) : clips[0];
if (!clip) { console.error('clips:', clips.map((c) => `${c.name} (${c.duration.toFixed(2)} s)`).join(', ')); process.exit(1); }
const root = gltf.scene, mixer = new THREE.AnimationMixer(root);
mixer.clipAction(clip).play();
const bones = []; root.traverse((o) => { if (o.isBone) bones.push(o); });
const find = (...keys) => bones.find((b) => keys.every((k) => b.name.toLowerCase().includes(k)));
const J = {
  hips: find('hip') ?? find('pelvis'), head: find('head'),
  lSh: find('left', 'arm') ?? find('l', 'upperarm'), rSh: find('right', 'arm') ?? find('r', 'upperarm'),
  lEl: find('left', 'forearm'), rEl: find('right', 'forearm'),
  lHa: find('left', 'hand'), rHa: find('right', 'hand'),
  lFt: find('left', 'foot'), rFt: find('right', 'foot'),
};
const at = (t) => { mixer.setTime(t); root.updateMatrixWorld(true); const o = {}; for (const [k, b] of Object.entries(J)) if (b) o[k] = new THREE.Vector3().setFromMatrixPosition(b.matrixWorld); return o; };
// the body frame from the clip's first frame: forward from the feet's midpoint toward... the rest facing (+Z in glTF,
// Meshy's characters face +Z); side = up x fwd flipped to the body's right
const fwd = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(fwd, up);
const p0 = at(0), origin = p0.hips.clone().setY(0);
const local = (v) => { const d = v.clone().sub(origin); return [d.dot(fwd), d.dot(up), d.dot(right)]; };
// the chest's facing (normal of the shoulder line, in the ground plane; + turned to the body's right) and the right
// hand's travel from the first frame (its direction in the ground plane, once it has moved 0.1)
const chestYaw = (p) => { const s = p.rSh.clone().sub(p.lSh); return Math.atan2(-s.dot(fwd), s.dot(right)) * 180 / Math.PI; };
const travelYaw = (p) => { const d = p.rHa.clone().sub(p0.rHa); const h = Math.hypot(d.dot(fwd), d.dot(right)); return h < 0.1 ? '-' : `${(Math.atan2(d.dot(right), d.dot(fwd)) * 180 / Math.PI).toFixed(0)} (${h.toFixed(2)})`; };
const from = Number(opt('from', 0)), to = Number(opt('to', clip.duration)), step = Number(opt('step', 0.05));
const f2 = (x) => (x >= 0 ? ' ' : '') + x.toFixed(2);
console.log(`${clip.name}: ${clip.duration.toFixed(2)} s; bones ${Object.entries(J).map(([k, b]) => `${k}=${b?.name ?? '-'}`).join(' ')}`);
console.log('    t | lHand fwd/up/side | rHand fwd/up/side | head fwd/up      | hips fwd/up      | hand line yaw/pitch deg | hands apart | chest yaw | rHand travel yaw');
const r0 = p0.rHa.clone();
const frames = [];
for (let t = from; t <= to + 1e-6; t += step) {
  const p = at(t), L = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, local(v)])); frames.push({ t, L });
  const d = p.lHa.clone().sub(p.rHa), back = d.dot(fwd) < 0 ? d : d.clone().negate();   // rear hand → front hand
  const ln = back.clone().negate();
  const yaw = Math.atan2(ln.dot(right), ln.dot(fwd)) * 180 / Math.PI, pitch = Math.atan2(ln.dot(up), Math.hypot(ln.dot(fwd), ln.dot(right))) * 180 / Math.PI;
  const v3 = (a) => a.map(f2).join(' ');
  console.log(`${t.toFixed(2).padStart(5)} | ${v3(L.lHa)} | ${v3(L.rHa)} | ${f2(L.head[0])} ${f2(L.head[1])}      | ${f2(L.hips[0])} ${f2(L.hips[1])}      | ${yaw.toFixed(0).padStart(5)} ${pitch.toFixed(0).padStart(5)}             | ${d.length().toFixed(2)}        | ${chestYaw(p).toFixed(0).padStart(5)}     | ${travelYaw(p)}`);
}
const svgOut = opt('svg');
if (svgOut) {
  const S = 90, W = 150, H = 160, bonesDraw = [['hips', 'head'], ['lSh', 'lEl'], ['lEl', 'lHa'], ['rSh', 'rEl'], ['rEl', 'rHa'], ['hips', 'lFt'], ['hips', 'rFt'], ['lSh', 'rSh']];
  const cols = frames.length, g = [];
  frames.forEach(({ t, L }, i) => {
    for (const [row, [ax, ay, sy]] of [[0, [0, 1, -1]], [1, [0, 2, 1]]].map(([r, a]) => [r, a])) {
      const ox = i * W + 40, oy = row * H + (row ? 80 : 140);
      const P = (k) => L[k] ? [ox + L[k][ax] * S, oy + sy * L[k][ay] * S] : null;
      for (const [a, b] of bonesDraw) { const A = P(a), B = P(b); if (A && B) g.push(`<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="#ccc" stroke-width="2"/>`); }
      for (const [k, c] of [['lHa', '#4af'], ['rHa', '#f84'], ['head', '#ccc']]) { const A = P(k); if (A) g.push(`<circle cx="${A[0]}" cy="${A[1]}" r="${k === 'head' ? 7 : 4}" fill="${c}"/>`); }
      if (row === 0) g.push(`<text x="${ox - 30}" y="14" fill="#aaa" font-size="12">${t.toFixed(2)}</text>`);
    }
  });
  g.push(`<text x="4" y="${H * 2 - 6}" fill="#777" font-size="11">top row: side view (forward to the right, up); bottom: top view (forward right, body's right down). blue left hand, orange right.</text>`);
  writeFileSync(svgOut, `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * W}" height="${H * 2}" style="background:#222">${g.join('')}</svg>`);
  console.log('wrote', svgOut);
}
