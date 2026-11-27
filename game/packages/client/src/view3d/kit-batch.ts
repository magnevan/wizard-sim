/**
 * The kit scene drawn in few calls (the port's step 6): kit-render builds the court as some 1,600 pieces of 7,000
 * meshes, one draw call each, twice over with the shadow pass. Here the static ones are gathered, per square cell of
 * the scene (so what is out of view still isn't drawn) or copy by copy, and per material:
 *  - a model repeated with one stock material (piers, balustrades, lanterns, urns) becomes one BatchedMesh holding
 *    every copy: one call a pass, and each copy still culled on its own, in the shadow pass too;
 *  - everything else is merged into one mesh per material and cell, baked into world space.
 * The pieces stay where they were, hidden: what raycasts them (the ground's height, the cursor, fade.ts's tests) finds
 * them as before. A piece fade.ts is cutting is shown again on its own and taken out of its batches (cut()), so the
 * hole goes through that piece and not through everything that shares its material.
 *
 * Left as they were: anything transparent, moving (a model's spinning parts), already instanced, with a depth material
 * of its own, a draw order or a per-object hook. Shaders that read the model matrix (the triplanar stone, the decal, the
 * water) see world positions either way, since a merged mesh's matrix is the identity. The foliage cards also read its
 * scale, so they are merged per scale with that scale left on the mesh.
 */
import * as THREE from 'three';

/** A cell's side (u). */
const CELL = 16;
/** A geometry drawn at least this often with one stock material is batched copy by copy rather than merged. */
const INST_MIN = 3;

type Slot = { mesh: THREE.Mesh; start: number; count: number } | { bm: THREE.BatchedMesh; i: number };

export interface KitBatch {
  /** The batched meshes (add to the scene beside the hidden pieces). */
  group: THREE.Group;
  /** Show a piece on its own (on) and take it out of its batches, or put it back. */
  cut(piece: THREE.Object3D, on: boolean): void;
  /** Free the batches' GPU data (their geometry, and the BatchedMeshes' matrix textures). */
  dispose(): void;
  stats: { sources: number; merged: number; instanced: number; left: number };
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
/** Whether a material's shader is the stock one (so an instance matrix in the vertex stage is all it needs). */
const plain = (m: THREE.Material) => !own(m, 'onBeforeCompile');

/** Gather the static meshes under `kit` (buildKit's group: its children are the pieces) into batches. */
export function batchKit(kit: THREE.Group): KitBatch {
  kit.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = 'kit-batches';
  const stats = { sources: 0, merged: 0, instanced: 0, left: 0 };
  type Src = { mesh: THREE.Mesh; piece: THREE.Object3D; m: THREE.Matrix4; s: number };
  const srcs: Src[] = [];
  for (const piece of kit.children) {
    if (piece.userData.floor) continue;   // the floors: few, large, and what everything stands on
    const walk = (o: THREE.Object3D, moving: boolean) => {
      if (!o.visible) return;
      moving ||= o.name.toLowerCase().startsWith('spin');
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (moving || !eligible(m)) stats.left++;
        else {
          // the foliage cards scale their size by the model matrix's: keep a uniform scale on the batch
          const s = m.userData.foliage ? new THREE.Vector3().setFromMatrixColumn(m.matrixWorld, 0).length() : 1;
          srcs.push({ mesh: m, piece, m: m.matrixWorld.clone(), s });
        }
      }
      for (const c of o.children) walk(c, moving);
    };
    walk(piece, false);
  }
  stats.sources = srcs.length;
  const slots = new Map<THREE.Object3D, Slot[]>();
  const slot = (p: THREE.Object3D, s: Slot) => { let l = slots.get(p); if (!l) slots.set(p, (l = [])); l.push(s); };
  const cellOf = (s: Src) => {
    const g = s.mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const c = g.boundingSphere!.center.clone().applyMatrix4(s.m);
    return `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`;
  };
  const flags = (s: Src) => `${s.mesh.castShadow ? 1 : 0}${s.mesh.receiveShadow ? 1 : 0}`;
  // repeated models: by geometry, material and shadow flags (mirrored ones are merged: an instance can't turn its faces)
  const uses = new Map<string, Src[]>();
  for (const s of srcs) {
    if (!plain(s.mesh.material as THREE.Material) || s.m.determinant() <= 0 || sheared(s.m)) continue;
    const k = `${s.mesh.geometry.uuid}|${(s.mesh.material as THREE.Material).uuid}|${flags(s)}`;
    let l = uses.get(k); if (!l) uses.set(k, (l = [])); l.push(s);
  }
  const instanced = new Set<Src>();
  for (const list of uses.values()) {
    if (list.length < INST_MIN) continue;
    // one BatchedMesh per model: one call a pass, each copy culled on its own (in the shadow pass too)
    const g = list[0].mesh.geometry;
    const bm = new THREE.BatchedMesh(list.length, g.attributes.position.count, g.index ? g.index.count : 0, list[0].mesh.material as THREE.Material);
    const gid = bm.addGeometry(g);
    bm.castShadow = list[0].mesh.castShadow; bm.receiveShadow = list[0].mesh.receiveShadow;
    bm.sortObjects = false;
    for (const s of list) { const i = bm.addInstance(gid); bm.setMatrixAt(i, s.m); slot(s.piece, { bm, i }); instanced.add(s); }
    bm.computeBoundingSphere();
    bm.raycast = () => {};
    group.add(bm); stats.instanced++;
  }
  // the rest: merged by material, attributes, shadow flags, scale and cell
  const merge = new Map<string, Src[]>();
  for (const s of srcs) {
    if (instanced.has(s)) continue;
    const g = s.mesh.geometry, sig = Object.keys(g.attributes).sort().map((n) => `${n}${g.attributes[n].itemSize}`).join(',');
    const k = `${(s.mesh.material as THREE.Material).uuid}|${sig}|${flags(s)}|${s.s.toFixed(4)}|${cellOf(s)}`;
    let l = merge.get(k); if (!l) merge.set(k, (l = [])); l.push(s);
  }
  for (const list of merge.values()) {
    const mesh = merged(list, slot);
    group.add(mesh); stats.merged++;
  }
  for (const s of srcs) s.mesh.visible = false;
  const cut = (piece: THREE.Object3D, on: boolean) => {
    for (const s of slots.get(piece) ?? []) {
      if ('bm' in s) { s.bm.setVisibleAt(s.i, !on); continue; }
      const idx = s.mesh.geometry.index!, src = s.mesh.userData.index as Uint32Array;
      if (on) (idx.array as Uint32Array).fill(0, s.start, s.start + s.count);
      else (idx.array as Uint32Array).set(src.subarray(s.start, s.start + s.count), s.start);
      idx.addUpdateRange(s.start, s.count); idx.needsUpdate = true;
    }
    piece.traverse((o) => { if ((o as THREE.Mesh).isMesh && srcSet.has(o as THREE.Mesh)) o.visible = on; });
  };
  const srcSet = new Set(srcs.map((s) => s.mesh));
  const dispose = () => { for (const o of group.children) { if ((o as THREE.BatchedMesh).isBatchedMesh) (o as THREE.BatchedMesh).dispose(); else (o as THREE.Mesh).geometry.dispose(); } };
  return { group, cut, dispose, stats };
}

const cx = new THREE.Vector3(), cy = new THREE.Vector3(), cz = new THREE.Vector3();
/**
 * Whether a matrix shears (a flight's balustrades follow its slope that way): a batch's instance turns normals by an
 * approximation that is exact only without shear, so those are merged instead, with their true normal matrix.
 */
function sheared(m: THREE.Matrix4): boolean {
  m.extractBasis(cx, cy, cz);
  const lx = cx.length(), ly = cy.length(), lz = cz.length(), eps = 1e-4;
  return Math.abs(cx.dot(cy)) > eps * lx * ly || Math.abs(cy.dot(cz)) > eps * ly * lz || Math.abs(cz.dot(cx)) > eps * lz * lx;
}

function eligible(m: THREE.Mesh): boolean {
  const mat = m.material;
  if (Array.isArray(mat) || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  // instanced geometry on a plain mesh (kit-ground.ts's margin grass): merging would keep one copy of its stand-in quad
  if ((m.geometry as THREE.InstancedBufferGeometry).isInstancedBufferGeometry) return false;
  if (mat.transparent || m.customDepthMaterial || m.customDistanceMaterial || m.renderOrder !== 0) return false;
  if (own(m, 'onBeforeRender') || own(m, 'onAfterRender')) return false;
  const g = m.geometry;
  // (groups don't matter with one material: three draws the whole geometry once)
  if (!g.attributes.position || Object.keys(g.morphAttributes).length) return false;
  if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  return true;
}

/** One mesh of `list` (one material), each source baked into world space (less a foliage scale, kept on the mesh). */
function merged(list: { mesh: THREE.Mesh; piece: THREE.Object3D; m: THREE.Matrix4; s: number }[], slot: (p: THREE.Object3D, s: Slot) => void): THREE.Mesh {
  const first = list[0].mesh, names = Object.keys(first.geometry.attributes);
  let nv = 0, ni = 0;
  for (const { mesh } of list) { nv += mesh.geometry.attributes.position.count; ni += mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count; }
  const out: Record<string, Float32Array> = {};
  for (const n of names) out[n] = new Float32Array(nv * first.geometry.attributes[n].itemSize);
  const index = new Uint32Array(ni);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), first.material);
  const B = new THREE.Matrix4(), N = new THREE.Matrix3(), v = new THREE.Vector3(), unscale = new THREE.Matrix4();
  let vo = 0, io = 0;
  for (const src of list) {
    const g = src.mesh.geometry, count = g.attributes.position.count;
    B.copy(src.m);
    if (src.s !== 1) B.premultiply(unscale.makeScale(1 / src.s, 1 / src.s, 1 / src.s));   // the mesh's scale s puts it back
    N.getNormalMatrix(B);
    const flip = B.determinant() < 0;
    for (const n of names) {
      const a = g.attributes[n] as THREE.BufferAttribute, o = out[n], k = a.itemSize;
      for (let i = 0; i < count; i++) {
        const at = (vo + i) * k;
        if (n === 'position') { v.fromBufferAttribute(a, i).applyMatrix4(B); o[at] = v.x; o[at + 1] = v.y; o[at + 2] = v.z; }
        else if (n === 'normal') { v.fromBufferAttribute(a, i).applyMatrix3(N).normalize(); o[at] = v.x; o[at + 1] = v.y; o[at + 2] = v.z; }
        else if (n === 'tangent') { v.fromBufferAttribute(a, i).transformDirection(B); o[at] = v.x; o[at + 1] = v.y; o[at + 2] = v.z; o[at + 3] = a.getW(i) * (flip ? -1 : 1); }
        else for (let c = 0; c < k; c++) o[at + c] = a.getComponent(i, c);
      }
    }
    const start = io;
    if (g.index) {
      const ix = g.index;
      for (let t = 0; t < ix.count; t += 3) {
        const a = ix.getX(t) + vo, b = ix.getX(t + 1) + vo, c = ix.getX(t + 2) + vo;
        index[io++] = a; index[io++] = flip ? c : b; index[io++] = flip ? b : c;
      }
    } else {
      for (let t = 0; t < count; t += 3) { index[io++] = vo + t; index[io++] = vo + (flip ? t + 2 : t + 1); index[io++] = vo + (flip ? t + 1 : t + 2); }
    }
    slot(src.piece, { mesh, start, count: io - start });
    vo += count;
  }
  const geo = mesh.geometry;
  for (const n of names) geo.setAttribute(n, new THREE.BufferAttribute(out[n], first.geometry.attributes[n].itemSize));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  mesh.userData.index = index.slice();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const s = list[0].s;
  if (s !== 1) { mesh.scale.setScalar(s); geo.boundingSphere!.radius += 0.8; mesh.userData.foliage = true; }
  mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
  mesh.raycast = () => {};
  return mesh;
}
