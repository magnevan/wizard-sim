/**
 * The stand-ins' drawing kit (standins.ts): plain triangles rebuilt every frame from scratch, in three batches, each one
 * draw call. Nothing is kept from one frame to the next, so the stand-ins are functions of the sim's state and the clock.
 *
 *   - `tint`: alpha-blended, depth-tested, no depth writes: the fills (floors, cones, fields, telegraphs) in deep colours
 *   - `glow`: the same, drawn over the tint: the bright cores (beams, arcs, rims, sparks), in light colours. Not
 *     additive: an additive colour washes out to white on the bright court stone, and the stand-ins must read there
 *   - `solid`: opaque, shaded on the CPU from one fixed light (rock walls, rocks in flight, turrets)
 *
 * Space: the effects' (fx/from-sim.ts): a sim point (x, y) is three's (x, z), height y. `ground(x, y)` gives the floor's
 * height there; everything on the floor follows it, every few tenths of a unit. Colours are linear RGB and may go past 1
 * (the stage is HDR and tone-maps at the end).
 */
import * as THREE from 'three';

export type RGB = readonly [number, number, number];
export type Ground = (x: number, y: number) => number;
type V3 = [number, number, number];

/** Lift (u) of what lies on the floor, so it never fights the stone (the decals also pull toward the camera). */
const LIFT = 0.05;
/** Floor-following strips are cut at least this often (u). */
const STEP = 0.5;
/** The tint batch's alphas are scaled by this: the court's stone is bright, and pale fills vanish on it. */
const TINT_K = 1.35;
/** The solid batch's light: from the south-west and above, as the kit's sun. */
const LIGHT = new THREE.Vector3(-0.55, 0.75, 0.4).normalize();

class Buf {
  pos = new Float32Array(3 * 4096);
  col = new Float32Array(4 * 4096);
  n = 0;
  /** Every alpha written is scaled by this (the tint batch's, so fills read on bright stone; one knob for all of them). */
  alphaK = 1;
  readonly geo = new THREE.BufferGeometry();
  readonly mesh: THREE.Mesh;
  private pa = new THREE.BufferAttribute(this.pos, 3);
  private ca = new THREE.BufferAttribute(this.col, 4);

  constructor(mat: THREE.Material, order: number) {
    this.pa.setUsage(THREE.DynamicDrawUsage); this.ca.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pa); this.geo.setAttribute('color', this.ca);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
  }

  vert(x: number, y: number, z: number, r: number, g: number, b: number, a: number): void {
    if (this.n * 3 + 3 > this.pos.length) this.grow();
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = Math.min(1, a * this.alphaK);
  }

  private grow(): void {
    const p = new Float32Array(this.pos.length * 2), c = new Float32Array(this.col.length * 2);
    p.set(this.pos); c.set(this.col);
    this.pos = p; this.col = c;
    this.pa = new THREE.BufferAttribute(p, 3); this.ca = new THREE.BufferAttribute(c, 4);
    this.pa.setUsage(THREE.DynamicDrawUsage); this.ca.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pa); this.geo.setAttribute('color', this.ca);
  }

  upload(): void {
    this.pa.needsUpdate = true; this.ca.needsUpdate = true;
    this.pa.clearUpdateRanges(); this.pa.addUpdateRange(0, this.n * 3);
    this.ca.clearUpdateRanges(); this.ca.addUpdateRange(0, this.n * 4);
    this.geo.setDrawRange(0, this.n);
    this.mesh.visible = this.n > 0;
  }
}

/** A unit icosphere (one subdivision), as a flat triangle list: missiles and orbs. */
const SPHERE: number[] = (() => {
  const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed(), p = g.getAttribute('position');
  return Array.from(p.array as Float32Array);
})();
/** A lumpy unit rock (an icosahedron with its corners pushed in and out). */
const ROCK: number[] = (() => {
  const g = new THREE.IcosahedronGeometry(1, 0), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + 0.4 * (((Math.sin(i * 12.9898 + p.getX(i) * 78.233) * 43758.5453) % 1 + 1) % 1);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.85, p.getZ(i) * k);
  }
  return Array.from(g.toNonIndexed().getAttribute('position').array as Float32Array);
})();

export class Batch {
  readonly group = new THREE.Group();
  readonly glowBuf: Buf;
  readonly tintBuf: Buf;
  readonly solidBuf: Buf;
  /** The camera's position and its screen right and up (fx space), for camera-facing pieces. */
  readonly eye = new THREE.Vector3();
  readonly right = new THREE.Vector3(1, 0, 0);
  readonly up = new THREE.Vector3(0, 1, 0);
  ground: Ground = () => 0;

  constructor() {
    const base = { vertexColors: true, side: THREE.DoubleSide, toneMapped: false } as const;
    this.solidBuf = new Buf(new THREE.MeshBasicMaterial({ ...base }), 4);
    const tint = new THREE.MeshBasicMaterial({ ...base, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.tintBuf = new Buf(tint, 5);
    this.tintBuf.alphaK = TINT_K;
    const glow = new THREE.MeshBasicMaterial({ ...base, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.glowBuf = new Buf(glow, 6);
    this.group.add(this.solidBuf.mesh, this.tintBuf.mesh, this.glowBuf.mesh);
    this.group.name = 'standins';
  }

  /** Starts a frame: `cam` is the effects' camera (fx space). */
  begin(cam: THREE.Camera): void {
    this.glowBuf.n = this.tintBuf.n = this.solidBuf.n = 0;
    cam.updateMatrixWorld();
    this.eye.setFromMatrixPosition(cam.matrixWorld);
    const e = cam.matrixWorld.elements;
    this.right.set(e[0], e[1], e[2]).normalize(); this.up.set(e[4], e[5], e[6]).normalize();
  }

  end(): void { this.glowBuf.upload(); this.tintBuf.upload(); this.solidBuf.upload(); }

  /** Triangles drawn this frame, by batch. */
  get counts(): { glow: number; tint: number; solid: number } { return { glow: this.glowBuf.n / 3, tint: this.tintBuf.n / 3, solid: this.solidBuf.n / 3 }; }

  /** The floor's height at sim (x, y), plus the lift. */
  gy(x: number, y: number): number { return this.ground(x, y) + LIFT; }

  // ---- raw ----------------------------------------------------------------------------------------------------------
  tri(buf: Buf, a: V3, b: V3, c: V3, ca: RGB, aa: number, cb: RGB = ca, ab = aa, cc: RGB = ca, ac = aa): void {
    buf.vert(a[0], a[1], a[2], ca[0], ca[1], ca[2], aa);
    buf.vert(b[0], b[1], b[2], cb[0], cb[1], cb[2], ab);
    buf.vert(c[0], c[1], c[2], cc[0], cc[1], cc[2], ac);
  }
  /** a b c d in order round the quad; the first two take (c0, a0), the last two (c1, a1). */
  quad(buf: Buf, a: V3, b: V3, c: V3, d: V3, c0: RGB, a0: number, c1: RGB = c0, a1 = a0): void {
    this.tri(buf, a, b, c, c0, a0, c0, a0, c1, a1);
    this.tri(buf, a, c, d, c0, a0, c1, a1, c1, a1);
  }

  // ---- on the floor ---------------------------------------------------------------------------------------------------
  /**
   * A ring band on the floor round (x, y) from r0 to r1, between angles a0 and a1 (rad, from +x toward +y): an
   * annulus, an arc, or with r0 = 0 a filled disc or wedge. Inner and outer edges can differ in colour and alpha.
   */
  ring(buf: Buf, x: number, y: number, r0: number, r1: number, cIn: RGB, aIn: number, cOut: RGB = cIn, aOut = aIn, a0 = 0, a1 = Math.PI * 2): void {
    if (r1 <= 0 || a1 <= a0) return;
    const n = Math.max(6, Math.ceil(((a1 - a0) * r1) / 0.35)), rings = r0 <= 0 ? Math.max(1, Math.ceil(r1 / 1.5)) : 1;
    for (let j = 0; j < rings; j++) {
      const ra = r0 + ((r1 - r0) * j) / rings, rb = r0 + ((r1 - r0) * (j + 1)) / rings;
      const fa = j / rings, fb = (j + 1) / rings;
      const mix = (f: number): [RGB, number] => [[cIn[0] + (cOut[0] - cIn[0]) * f, cIn[1] + (cOut[1] - cIn[1]) * f, cIn[2] + (cOut[2] - cIn[2]) * f], aIn + (aOut - aIn) * f];
      const [ca, aa] = mix(fa), [cb, ab] = mix(fb);
      for (let k = 0; k < n; k++) {
        const t0 = a0 + ((a1 - a0) * k) / n, t1 = a0 + ((a1 - a0) * (k + 1)) / n;
        const p = (r: number, t: number): V3 => { const px = x + Math.cos(t) * r, py = y + Math.sin(t) * r; return [px, this.gy(px, py), py]; };
        this.quad(buf, p(ra, t0), p(ra, t1), p(rb, t1), p(rb, t0), ca, aa, cb, ab);
      }
    }
  }

  /** A thin circle outline on the floor (width w, u). */
  circle(buf: Buf, x: number, y: number, r: number, w: number, c: RGB, a: number, a0 = 0, a1 = Math.PI * 2): void {
    this.ring(buf, x, y, Math.max(0, r - w / 2), r + w / 2, c, a, c, a, a0, a1);
  }

  /** A strip on the floor from a to b, `w` wide, its colour fading from (c0, a0) at a to (c1, a1) at b. */
  strip(buf: Buf, ax: number, ay: number, bx: number, by: number, w: number, c0: RGB, a0: number, c1: RGB = c0, a1 = a0, w1 = w): void {
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-4) return;
    const nx = -(by - ay) / L, ny = (bx - ax) / L, n = Math.max(1, Math.ceil(L / STEP));
    for (let k = 0; k < n; k++) {
      const f0 = k / n, f1 = (k + 1) / n;
      const px0 = ax + (bx - ax) * f0, py0 = ay + (by - ay) * f0, px1 = ax + (bx - ax) * f1, py1 = ay + (by - ay) * f1;
      const h0 = (w + (w1 - w) * f0) / 2, h1 = (w + (w1 - w) * f1) / 2;
      const P = (px: number, py: number): V3 => [px, this.gy(px, py), py];
      const cA: RGB = [c0[0] + (c1[0] - c0[0]) * f0, c0[1] + (c1[1] - c0[1]) * f0, c0[2] + (c1[2] - c0[2]) * f0];
      const cB: RGB = [c0[0] + (c1[0] - c0[0]) * f1, c0[1] + (c1[1] - c0[1]) * f1, c0[2] + (c1[2] - c0[2]) * f1];
      const aA = a0 + (a1 - a0) * f0, aB = a0 + (a1 - a0) * f1;
      this.tri(buf, P(px0 + nx * h0, py0 + ny * h0), P(px0 - nx * h0, py0 - ny * h0), P(px1 - nx * h1, py1 - ny * h1), cA, aA, cA, aA, cB, aB);
      this.tri(buf, P(px0 + nx * h0, py0 + ny * h0), P(px1 - nx * h1, py1 - ny * h1), P(px1 + nx * h1, py1 + ny * h1), cA, aA, cB, aB, cB, aB);
    }
  }

  /** A filled cell-sized square on the floor (a surface's cell), corners at their own heights. */
  cell(buf: Buf, x0: number, y0: number, s: number, c: RGB, a: number): void {
    const P = (px: number, py: number): V3 => [px, this.gy(px, py), py];
    this.quad(buf, P(x0, y0), P(x0 + s, y0), P(x0 + s, y0 + s), P(x0, y0 + s), c, a);
  }

  // ---- in the air -----------------------------------------------------------------------------------------------------
  /** A camera-facing ribbon through 3D points, `w` wide (u), the colour and alpha running from the first to the last. */
  ribbon(buf: Buf, pts: readonly V3[], w: number, c0: RGB, a0: number, c1: RGB = c0, a1 = a0, w1 = w): void {
    if (pts.length < 2) return;
    const d = new THREE.Vector3(), v = new THREE.Vector3(), side = new THREE.Vector3();
    const sides: V3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      v.set(this.eye.x - pts[i][0], this.eye.y - pts[i][1], this.eye.z - pts[i][2]).normalize();
      side.crossVectors(d, v).normalize();
      const f = i / (pts.length - 1), hw = (w + (w1 - w) * f) / 2;
      sides.push([side.x * hw, side.y * hw, side.z * hw]);
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1], s = sides[i], t = sides[i + 1], f0 = i / (pts.length - 1), f1 = (i + 1) / (pts.length - 1);
      const cA: RGB = [c0[0] + (c1[0] - c0[0]) * f0, c0[1] + (c1[1] - c0[1]) * f0, c0[2] + (c1[2] - c0[2]) * f0];
      const cB: RGB = [c0[0] + (c1[0] - c0[0]) * f1, c0[1] + (c1[1] - c0[1]) * f1, c0[2] + (c1[2] - c0[2]) * f1];
      this.quad(buf, [p[0] + s[0], p[1] + s[1], p[2] + s[2]], [p[0] - s[0], p[1] - s[1], p[2] - s[2]], [q[0] - t[0], q[1] - t[1], q[2] - t[2]], [q[0] + t[0], q[1] + t[1], q[2] + t[2]], cA, a0 + (a1 - a0) * f0, cB, a1 === a0 ? a0 : a0 + (a1 - a0) * f1);
    }
  }

  /** A soft camera-facing disc: full colour in the middle, nothing at the rim (a glow, a puff, a spark). */
  blob(buf: Buf, x: number, y: number, z: number, r: number, c: RGB, a: number, edge = 0): void {
    const n = 10, R = this.right, U = this.up;
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * Math.PI * 2, t1 = ((k + 1) / n) * Math.PI * 2;
      const p = (t: number): V3 => [x + (R.x * Math.cos(t) + U.x * Math.sin(t)) * r, y + (R.y * Math.cos(t) + U.y * Math.sin(t)) * r, z + (R.z * Math.cos(t) + U.z * Math.sin(t)) * r];
      this.tri(buf, [x, y, z], p(t0), p(t1), c, a, c, a * edge, c, a * edge);
    }
  }

  /** A vertical band: a ring of quads round (x, z) from height y0 to y1, radius r (a ward, an aura's column, a frozen shell). */
  band(buf: Buf, x: number, y0: number, z: number, r: number, y1: number, c: RGB, aLow: number, aHigh: number, r1 = r): void {
    const n = 20;
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * Math.PI * 2, t1 = ((k + 1) / n) * Math.PI * 2;
      this.quad(buf, [x + Math.cos(t0) * r, y0, z + Math.sin(t0) * r], [x + Math.cos(t1) * r, y0, z + Math.sin(t1) * r],
        [x + Math.cos(t1) * r1, y1, z + Math.sin(t1) * r1], [x + Math.cos(t0) * r1, y1, z + Math.sin(t0) * r1], c, aLow, c, aHigh);
    }
  }

  /** A vertical sheet standing on the floor along a -> b, `h` tall (a barrier, a curtain, a wave's front). */
  sheet(buf: Buf, ax: number, ay: number, bx: number, by: number, h: number, cLow: RGB, aLow: number, cHigh: RGB, aHigh: number): void {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / STEP));
    for (let k = 0; k < n; k++) {
      const x0 = ax + ((bx - ax) * k) / n, y0 = ay + ((by - ay) * k) / n, x1 = ax + ((bx - ax) * (k + 1)) / n, y1 = ay + ((by - ay) * (k + 1)) / n;
      const g0 = this.gy(x0, y0), g1 = this.gy(x1, y1);
      this.quad(buf, [x0, g0, y0], [x1, g1, y1], [x1, g1 + h, y1], [x0, g0 + h, y0], cLow, aLow, cHigh, aHigh);
    }
  }

  // ---- solids (shaded) -----------------------------------------------------------------------------------------------
  private shadeTri(a: V3, b: V3, c: V3, col: RGB, light = 1): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    // two-sided: face the eye
    if ((this.eye.x - a[0]) * nx + (this.eye.y - a[1]) * ny + (this.eye.z - a[2]) * nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const k = (0.42 + 0.58 * Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z)) * light;
    const s: RGB = [col[0] * k, col[1] * k, col[2] * k];
    this.tri(this.solidBuf, a, b, c, s, 1);
  }

  /** A box standing on the floor along a -> b: `thick` across, `h` tall (a rock or ice wall's segment, a turret's post). */
  slab(ax: number, ay: number, bx: number, by: number, thick: number, h: number, col: RGB, top: RGB = col): void {
    const L = Math.hypot(bx - ax, by - ay) || 1e-3, nx = (-(by - ay) / L) * thick / 2, ny = ((bx - ax) / L) * thick / 2;
    const ga = this.ground(ax, ay), gb = this.ground(bx, by), base = Math.min(ga, gb) - 0.05;
    const c: V3[] = [[ax + nx, base, ay + ny], [bx + nx, base, by + ny], [bx - nx, base, by - ny], [ax - nx, base, ay - ny]];
    const t: V3[] = [[ax + nx, ga + h, ay + ny], [bx + nx, gb + h, by + ny], [bx - nx, gb + h, by - ny], [ax - nx, ga + h, ay - ny]];
    for (let k = 0; k < 4; k++) { const j = (k + 1) % 4; this.shadeTri(c[k], c[j], t[j], col); this.shadeTri(c[k], t[j], t[k], col); }
    this.shadeTri(t[0], t[1], t[2], top); this.shadeTri(t[0], t[2], t[3], top);
  }

  /** A shaded ball (`rock`: a lumpy one), centre (x, y, z), radius r, squashed or stretched along `dir` by `stretch`. */
  ball(x: number, y: number, z: number, r: number, col: RGB, rock = false, dir?: [number, number], stretch = 1, spin = 0): void {
    const src = rock ? ROCK : SPHERE, cs = Math.cos(spin), sn = Math.sin(spin);
    const dx = dir ? dir[0] : 1, dz = dir ? dir[1] : 0;
    const pts: V3[] = [];
    for (let i = 0; i < src.length; i += 3) {
      let px = src[i], py = src[i + 1], pz = src[i + 2];
      // spin about the vertical, then stretch along the flight
      const rx = px * cs - pz * sn, rz = px * sn + pz * cs; px = rx; pz = rz;
      const along = px * dx + pz * dz;
      px += dx * along * (stretch - 1); pz += dz * along * (stretch - 1);
      pts.push([x + px * r, y + py * r, z + pz * r]);
      if (pts.length === 3) { this.shadeTri(pts[0], pts[1], pts[2], col); pts.length = 0; }
    }
  }
}
