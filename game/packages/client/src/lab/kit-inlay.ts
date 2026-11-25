/**
 * An inlay for the kit renderer (kit-render.ts): kit.json class "inlay", a stone slab set into a floor (the sunk plaza's
 * radial floor, pin p34), standing `height` m proud of it inside a low rim, with recessed channels cut into its top and
 * filled with a slowly flowing field: a painted texture (content/generated/textures, e.g. magic-flow) scrolled along
 * each channel, tinted per channel, with a soft glow. Shapes are built here to size; what you see on them is painted
 * (the slab's top takes the scene's decal, the rim the smooth stone, the field its texture).
 *
 * kit.json:
 *   "shape": "round" | "box", "footprint": [w, d] u, "height": m the slab's top stands above its floor,
 *   "rim": [width u, height m above the slab's top] (optional),
 *   "channels": {"w": u wide, "depth": m below the slab's top, "texture": name, "tile": u per tile, "speed": u a second,
 *                "glow": emissive strength, "runs": [{"a": degrees, "from": u, "to": u, "tint": "#rrggbb"}  // radial
 *                                                   | {"pts": [[x, y], [x, y]], "tint": ...}]}         // a line
 * Run coordinates are in the piece's own frame as the decal's picture has it (x to its right, y toward its front, u
 * from its centre; front S: x east, y south); a channel flows from its first point to its last.
 */
import * as THREE from 'three';

const yOf = (m: number) => m / 0.6;   // metres to u (as kit-render's; not imported, which would make a cycle)

export type InlayRun = { a?: number; from?: number; to?: number; pts?: number[][]; tint?: string };
export type InlaySpec = {
  shape?: string; footprint?: [number, number]; height?: number; rim?: [number, number];
  channels?: { w?: number; depth?: number; texture?: string; tile?: number; speed?: number; glow?: number; runs?: InlayRun[] };
};
export type InlayMats = { top: THREE.Material; side: THREE.Material; rim: THREE.Material };

/** The flowing textures of the inlays built, each scrolled at its speed (u a second over its tile) by flowInlays. */
const FLOWING: { tex: THREE.Texture; rate: number }[] = [];
export function clearInlays() { FLOWING.length = 0; }
export function flowInlays(t: number) { for (const f of FLOWING) f.tex.offset.x = -t * f.rate; }

/** A run's two ends in the piece's frame (x, y). */
function ends(r: InlayRun): [number, number, number, number] | null {
  if (r.pts && r.pts.length >= 2) { const a = r.pts[0], b = r.pts[r.pts.length - 1]; return [a[0], a[1], b[0], b[1]]; }
  if (r.a == null || r.from == null || r.to == null) return null;
  const c = Math.cos((r.a * Math.PI) / 180), s = Math.sin((r.a * Math.PI) / 180);
  return [c * r.from, s * r.from, c * r.to, s * r.to];
}

/** An outline in the piece's frame, as a shape lying flat (shape y = -frame y; the mesh is turned -90 degrees about x). */
function outline(round: boolean, w: number, d: number, p: THREE.Path = new THREE.Shape()) {
  if (round) p.absellipse(0, 0, w / 2, d / 2, 0, Math.PI * 2, false, 0);
  else { p.moveTo(-w / 2, -d / 2); p.lineTo(w / 2, -d / 2); p.lineTo(w / 2, d / 2); p.lineTo(-w / 2, d / 2); p.lineTo(-w / 2, -d / 2); }
  return p;
}
function extrude(s: THREE.Shape, y0: number, y1: number, m: THREE.Material | THREE.Material[]) {
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false, curveSegments: 96 }), m);
  mesh.rotation.x = -Math.PI / 2; mesh.position.y = y0; mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/**
 * The inlay in its own frame (x right, z toward its front, y up from its floor), into a group the caller places.
 * `field` is the channels' texture (loaded by the caller), or undefined to leave them bare stone.
 */
export function inlayInto(g: THREE.Group, k: InlaySpec, mats: InlayMats, field: THREE.Texture | undefined) {
  const [w, d] = k.footprint ?? [10, 10], round = k.shape === 'round';
  const top = yOf(k.height ?? 0.1), floor = -0.1;   // its foot a little under the floor, so no seam shows at the ground
  const [rimW, rimH] = k.rim ?? [0, 0];
  const ch = k.channels ?? {}, cw = ch.w ?? 1, deep = yOf(ch.depth ?? 0.1);
  const runs = (ch.runs ?? []).map((r) => ({ r, e: ends(r) })).filter((x) => x.e) as { r: InlayRun; e: [number, number, number, number] }[];

  // the slab: its outline (under the rim, by half the rim's width) with every channel cut through it
  const inset = rimW / 2, slab = outline(round, w - 2 * inset, d - 2 * inset) as THREE.Shape;
  for (const { e: [x0, y0, x1, y1] } of runs) {
    const L = Math.hypot(x1 - x0, y1 - y0), nx = (-(y1 - y0) / L) * (cw / 2), ny = ((x1 - x0) / L) * (cw / 2);
    const h = new THREE.Path();
    h.moveTo(x0 + nx, -(y0 + ny)); h.lineTo(x1 + nx, -(y1 + ny)); h.lineTo(x1 - nx, -(y1 - ny)); h.lineTo(x0 - nx, -(y0 - ny)); h.lineTo(x0 + nx, -(y0 + ny));
    slab.holes.push(h);
  }
  g.add(extrude(slab, floor, top, [mats.top, mats.side]));
  // the rim: a band round the edge, a little proud of the slab
  if (rimW > 0) {
    const band = outline(round, w, d) as THREE.Shape;
    band.holes.push(outline(round, w - 2 * rimW, d - 2 * rimW, new THREE.Path()));
    g.add(extrude(band, floor, top + yOf(rimH), mats.rim));
  }
  if (!field) return g;

  // the field: one sheet along each channel's floor, the texture's streaks along the flow, scrolled toward its end
  const tile = ch.tile ?? 2, tex = field.clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.needsUpdate = true;
  FLOWING.push({ tex, rate: (ch.speed ?? 0.2) / tile });
  const y = top - deep;
  for (const { r, e: [x0, y0, x1, y1] } of runs) {
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, half = cw / 2 + 0.01;
    const P = (s: number, a: number) => [x0 + ux * s - uy * a, y, y0 + uy * s + ux * a];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...P(0, -half), ...P(L, -half), ...P(L, half), ...P(0, half)], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, -half / tile, L / tile, -half / tile, L / tile, half / tile, 0, half / tile], 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]); geo.computeVertexNormals();
    const tint = new THREE.Color(r.tint ?? '#ffffff');
    const m = new THREE.MeshStandardMaterial({ color: tint, map: tex, emissive: tint, emissiveMap: tex, emissiveIntensity: ch.glow ?? 0.6, roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}
