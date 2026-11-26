/**
 * Conduit pipes for the kit renderer (kit-render.ts): the compiler's `pipe.run` (tools/kit/compile.py, from a scene's
 * `pipe` object), drawn to size along its route, never a model (the user, 2026-11-26: pipes are a run that changes with
 * the layout; Meshy couldn't model a pipe sheet). The look is the infirmary's conduit (docs/reference/infirmary-kit/
 * conduit-clean-a.png): a polished brass tube with short rounded bends, riveted flange collars at its ends, its joints
 * and every COLLAR_EVERY u, a blue enamel band with the academy's gold eight-point star every BAND_EVERY u or so,
 * sandstone saddles under its level runs (where the compiler put them), a collar on the main where a branch tees in, and
 * an open mouth (a dark sleeve inside the collar) at a free end. Surfaces are Codex-painted textures mapped by the
 * pipe's own UVs: brass along the tube, the collar's rivet row and the band's star round it; the saddles wear the kit's
 * world-mapped stone. One mesh per material per pipe (the game's kit-batch.ts merges them further).
 * Coordinates as kit-render: three's x is the scene's x (u), z its y (u), y the height (u).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** The pipe's materials: painted brass, the collars' rivet rows, the enamel band, the dark inside of a mouth, and the saddles' stone. */
export type PipeMats = { brass: THREE.Material; collar: THREE.Material; band: THREE.Material; inside: THREE.Material; stone: THREE.Material };
/** A pipe.run as compiled: pts [x u, y u, z m]; ends open / plug / tee; tees with the main's point and direction; saddles [x u, y u, floor m, z m, angle]. */
export type PipeRun = { pts: number[][]; r?: number; ends?: string[]; tees?: { end: number; r: number; at: number[]; dir: number[] }[]; saddles?: number[][] };

/** u: the tube's sides, bend radius (at most), collar spacing, band spacing, and the parts' sizes (as shares of r where noted). */
export const PIPE = { sides: 14, bend: 0.55, collarEvery: 2.5, bandEvery: 5, collarR: 1.3, collarL: 0.26, bandR: 1.05, bandL: 0.42, rivetTiles: 3, starTiles: 3, brassTile: 2 };

/** A small indexed geometry builder. */
class Geo {
  p: number[] = []; n: number[] = []; uv: number[] = []; idx: number[] = [];
  v(p: THREE.Vector3, n: THREE.Vector3, u: number, w: number) { this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.uv.push(u, w); return this.p.length / 3 - 1; }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
/** A unit normal to d (kept level where it can be, so collars' rivet rows line up from piece to piece). */
function perp(d: THREE.Vector3): THREE.Vector3 {
  const n = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.95 ? X : UP);
  return n.normalize();
}

/** A ring of `sides` points round c in the plane normal to d, from n: [point, outward normal] pairs (closing one repeated). */
function ring(c: THREE.Vector3, d: THREE.Vector3, n: THREE.Vector3, r: number, sides: number): [THREE.Vector3, THREE.Vector3][] {
  const b = new THREE.Vector3().crossVectors(d, n).normalize(), out: [THREE.Vector3, THREE.Vector3][] = [];
  for (let k = 0; k <= sides; k++) {
    const a = (k / sides) * Math.PI * 2, o = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
    out.push([c.clone().addScaledVector(o, r), o]);
  }
  return out;
}

/** A short cylinder round c along d (length L, radius r), its UVs: x round it (tilesRound), y across it (0..1); or turned (bands: x across, y round). Ends closed by flat rims from rIn to r. */
function sleeve(g: Geo, c: THREE.Vector3, d: THREE.Vector3, r: number, L: number, tilesRound: number, turned: boolean, rIn: number, sides = 16) {
  const n = perp(d), a = c.clone().addScaledVector(d, -L / 2), b = c.clone().addScaledVector(d, L / 2);
  const ra = ring(a, d, n, r, sides), rb = ring(b, d, n, r, sides);
  const uv = (k: number, y: number): [number, number] => (turned ? [y, (k / sides) * tilesRound] : [(k / sides) * tilesRound, y]);
  const i0 = ra.map(([p, o], k) => g.v(p, o, ...uv(k, 0))), i1 = rb.map(([p, o], k) => g.v(p, o, ...uv(k, 1)));
  for (let k = 0; k < sides; k++) g.quad(i0[k], i0[k + 1], i1[k + 1], i1[k]);
  // the rims: flat rings facing out along -d and +d, wearing the edge of the picture (a collar's rim, a band's gold strip)
  for (const [at, dir, y] of [[a, d.clone().negate(), 0.03], [b, d, 0.97]] as [THREE.Vector3, THREE.Vector3, number][]) {
    const outer = ring(at, d, n, r, sides), inner = ring(at, d, n, rIn, sides);
    const io = outer.map(([p], k) => g.v(p, dir, ...uv(k, y))), ii = inner.map(([p], k) => g.v(p, dir, ...uv(k, y)));
    for (let k = 0; k < sides; k++) if (dir.dot(d) > 0) g.quad(ii[k], ii[k + 1], io[k + 1], io[k]); else g.quad(io[k], io[k + 1], ii[k + 1], ii[k]);
  }
}

/** The inside of an open mouth: a sleeve of radius r facing inward, from the end e back along -d by depth, and a dark disc closing it. */
function mouth(g: Geo, e: THREE.Vector3, d: THREE.Vector3, r: number, depth: number, sides = 14) {
  const n = perp(d), back = e.clone().addScaledVector(d, -depth);
  const ra = ring(e, d, n, r, sides), rb = ring(back, d, n, r, sides);
  const i0 = ra.map(([p, o], k) => g.v(p, o.clone().negate(), k / sides, 0)), i1 = rb.map(([p, o], k) => g.v(p, o.clone().negate(), k / sides, 1));
  for (let k = 0; k < sides; k++) g.quad(i0[k], i0[k + 1], i1[k + 1], i1[k]);
  const ci = g.v(back, d, 0.5, 0.5), rim = rb.map(([p]) => g.v(p, d, 0.5, 0.5));
  for (let k = 0; k < sides; k++) g.idx.push(ci, rim[k], rim[k + 1]);
}

/** A sandstone saddle under the pipe: a block cradling its lower half on a wider base slab, from the floor up. */
function saddle(x: number, z: number, floorY: number, pipeY: number, ang: number, r: number): THREE.BufferGeometry | null {
  const hc = pipeY - floorY, w = r * 2 + 0.26, dep = 0.3;
  if (hc - r < 0.12) return null;     // the pipe lies (nearly) on the floor: nothing to hold it up
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, hc); s.lineTo(r * 1.03, hc);
  s.absarc(0, hc, r * 1.03, 0, Math.PI, true);
  s.lineTo(-w / 2, hc); s.lineTo(-w / 2, 0);
  const body = new THREE.ExtrudeGeometry(s, { depth: dep, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 6 });
  body.translate(0, 0, -dep / 2);
  const base = new THREE.BoxGeometry(w + 0.18, 0.12, dep + 0.18).toNonIndexed();
  base.translate(0, 0.06, 0);
  const g = mergeGeometries([body, base]);   // (an extrusion is non-indexed already)
  body.dispose(); base.dispose();
  if (!g) return null;
  // local x across the pipe, z along it; the compiler's angle is along the run on the map (x, y) = three's (x, z)
  const m = new THREE.Matrix4().makeRotationY(-ang + Math.PI / 2).setPosition(x, floorY, z);
  return g.applyMatrix4(m);
}

/**
 * One pipe, as a group of up to five meshes (brass tube, collars, bands, mouths, saddles). `yOf` turns metres into u.
 */
export function pipeMesh(run: PipeRun, yOf: (m: number) => number, mats: PipeMats): THREE.Group {
  const out = new THREE.Group();
  const r = run.r ?? 0.22, P = PIPE;
  const W = run.pts.map(([x, y, z]) => new THREE.Vector3(x, yOf(z), y));
  if (W.length < 2) return out;
  const tube = new Geo(), coll = new Geo(), band = new Geo(), inside = new Geo();
  const dirOf = (a: THREE.Vector3, b: THREE.Vector3) => b.clone().sub(a).normalize();
  // the centre line: straight runs between rounded bends (a quadratic curve through each corner, BEND u from it at most)
  type Sp = { a: THREE.Vector3; b: THREE.Vector3 };
  const line: THREE.Vector3[] = [W[0].clone()], spans: Sp[] = [], joints: [THREE.Vector3, THREE.Vector3, number][] = [];
  let from = W[0].clone();
  for (let i = 1; i < W.length - 1; i++) {
    const din = dirOf(W[i - 1], W[i]), dout = dirOf(W[i], W[i + 1]);
    if (din.dot(dout) > 0.999) continue;
    const t = Math.min(P.bend, 0.4 * W[i].distanceTo(W[i - 1]), 0.4 * W[i].distanceTo(W[i + 1]));
    const b0 = W[i].clone().addScaledVector(din, -t), b1 = W[i].clone().addScaledVector(dout, t);
    spans.push({ a: from, b: b0 }); joints.push([b0, din, -1], [b1, dout, 1]);   // the collars sit on the straight side of each
    line.push(b0);
    const curve = new THREE.QuadraticBezierCurve3(b0, W[i], b1);
    for (let k = 1; k <= 6; k++) line.push(curve.getPoint(k / 6));
    from = b1.clone();
  }
  const last = W[W.length - 1];
  spans.push({ a: from, b: last.clone() }); line.push(last.clone());
  // the tube: rings along the centre line, turned by parallel transport so it never twists
  const tan = line.map((p, i) => {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  let n = perp(tan[0]), s = 0, prev: number[] | null = null;
  for (let i = 0; i < line.length; i++) {
    if (i > 0) {
      s += line[i].distanceTo(line[i - 1]);
      n.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(tan[i - 1], tan[i]));
      n.addScaledVector(tan[i], -n.dot(tan[i])).normalize();   // kept square to the tube
    }
    const ids = ring(line[i], tan[i], n, r, P.sides).map(([p, o], k) => tube.v(p, o, s / P.brassTile, (k / P.sides) * ((Math.PI * 2 * r) / P.brassTile)));
    if (prev) for (let k = 0; k < P.sides; k++) tube.quad(prev[k], prev[k + 1], ids[k + 1], ids[k]);
    prev = ids;
  }
  const rc = r * P.collarR, collar = (c: THREE.Vector3, d: THREE.Vector3) => sleeve(coll, c, d, rc, P.collarL, P.rivetTiles, false, r * 0.97);
  // collars at both ends of every bend (the elbow's flanges), and every collarEvery u along the straight runs; a band
  // in a bay between collars once bandEvery u have passed since the last
  for (const [c, d, side] of joints) collar(c.clone().addScaledVector(d, (side * P.collarL) / 2), d);
  let sinceBand = P.bandEvery * 0.6;
  for (const sp of spans) {
    const L = sp.a.distanceTo(sp.b); if (L < 1e-4) continue;
    const d = dirOf(sp.a, sp.b), k = Math.max(1, Math.round(L / P.collarEvery));
    for (let j = 1; j < k; j++) collar(sp.a.clone().addScaledVector(d, (L * j) / k), d);
    for (let j = 0; j < k; j++) {
      const bay = L / k; sinceBand += bay;
      if (sinceBand >= P.bandEvery && bay >= 0.9) {
        sleeve(band, sp.a.clone().addScaledVector(d, bay * (j + 0.5)), d, r * P.bandR, P.bandL, P.starTiles, true, r * 0.97);
        sinceBand = 0;
      }
    }
  }
  // the ends: an open mouth (collar flush with the end, a dark sleeve inside), a plug (a collar against the piece), a tee
  // (a collar on the branch just clear of the main, and one on the main round the joint)
  const ends = run.ends ?? ['open', 'open'];
  for (const k of [0, 1]) {
    const e = k ? last : W[0], d = k ? dirOf(W[W.length - 2], last) : dirOf(W[1], W[0]);   // d points out of the pipe
    const kind = ends[k];
    if (kind === 'tee') {
      const tee = run.tees?.find((t) => t.end === k);
      const rm = tee?.r ?? r;
      collar(e.clone().addScaledVector(d, -(rm * P.collarR + P.collarL / 2 + 0.04)), d);
      if (tee) {
        const md = new THREE.Vector3(tee.dir[0], tee.dir[2], tee.dir[1]).normalize();
        sleeve(coll, new THREE.Vector3(tee.at[0], yOf(tee.at[2]), tee.at[1]), md, rm * P.collarR, Math.max(P.collarL, r * 2 + 0.16), P.rivetTiles, false, rm * 0.97);
      }
      continue;
    }
    collar(e.clone().addScaledVector(d, -P.collarL / 2), d);
    if (kind === 'open') {
      mouth(inside, e, d, r * 0.8, 0.5);
      // the collar's face closes the gap from the sleeve to the collar's rim
      const nn = perp(d), outer = ring(e, d, nn, r * 1.01, P.sides), inner = ring(e, d, nn, r * 0.8, P.sides);
      const io = outer.map(([p], j) => coll.v(p, d, (j / P.sides) * P.rivetTiles, 0.97)), ii = inner.map(([p], j) => coll.v(p, d, (j / P.sides) * P.rivetTiles, 0.97));
      for (let j = 0; j < P.sides; j++) coll.quad(ii[j], ii[j + 1], io[j + 1], io[j]);
    }
  }
  const add = (g: THREE.BufferGeometry | null, m: THREE.Material, shadow = true) => {
    if (!g) return;
    const mesh = new THREE.Mesh(g, m); mesh.castShadow = shadow; mesh.receiveShadow = true; out.add(mesh);
  };
  add(tube.build(), mats.brass); add(coll.build(), mats.collar); add(band.build(), mats.band); add(inside.build(), mats.inside, false);
  const sg = (run.saddles ?? []).map(([x, y, fl, z, a]) => saddle(x, y, yOf(fl), yOf(z), a, r)).filter((g): g is THREE.BufferGeometry => !!g);
  if (sg.length) { add(mergeGeometries(sg), mats.stone); for (const g of sg) g.dispose(); }
  return out;
}
