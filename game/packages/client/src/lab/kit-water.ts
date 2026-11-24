/**
 * Water for the kit renderer (kit-render.ts): a floor of mat 'water' drawn as stylised, moving water, all in code
 * (the user, 2026-11-24: the painted texture sliding read as "just two textures sliding"; a code-only, cartoony
 * approach is fine). How stylised game water is usually made, and what this does:
 * - colour by depth, light and turquoise in the shallows, deep teal out (no depth buffer here: the distance to the
 *   shore stands in for depth, from a small signed distance field per body of water, made from the floor's outline);
 * - a Wind Waker-like pattern of bright cell lines (Worley noise, the gap between the nearest and second-nearest
 *   point), shown in patches that come and go, its points wandering in time, sampled through domain-warped coordinates
 *   (the coordinates bent by smooth noise that itself drifts), so it swirls and never reads as a sheet sliding by;
 * - shoreline foam as Roystan's toon water does it: noise against a cutoff that falls toward the shore, so the foam
 *   is solid at the edge and breaks into patches further out, plus soft rings rolling in toward the shore;
 * - glints: the brightest specks of a fine noise, twinkling on the bright lines;
 * - a slow swell (a sum of sines over a long wavelength) on a grid cut to the water's outline, calm at the shore,
 *   with crests a little lighter;
 * - a stream (a long narrow body) flows along its length, its cells stretched along the flow.
 */
import * as THREE from 'three';

export type Ring = number[][];
/** Distance to shore stored as 0..1 = -MAX_D..+MAX_D u (inside the water is positive). */
export const MAX_D = 4;

/**
 * A body of water's shore field over its box, every `cell` u: the signed distance (u) to the nearest shore. A shore is
 * an outline segment that isn't on the map's border (the sea running off the map edge has no foam there) or `open` (an arch's mouth).
 */
export function shoreField(rings: Ring[], box: { x0: number; y0: number; x1: number; y1: number }, cell: number, size: [number, number], open?: (ax: number, ay: number, bx: number, by: number) => boolean) {
  const W = Math.max(2, Math.ceil((box.x1 - box.x0) / cell) + 1), H = Math.max(2, Math.ceil((box.y1 - box.y0) / cell) + 1);
  const on = (v: number, lim: number) => Math.abs(v - lim) < 1e-3;
  const segs: number[][] = [], all: number[][] = [], opens: number[][] = [];
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    all.push([a[0], a[1], b[0], b[1]]);
    const border = (on(a[0], 0) && on(b[0], 0)) || (on(a[0], size[0]) && on(b[0], size[0])) || (on(a[1], 0) && on(b[1], 0)) || (on(a[1], size[1]) && on(b[1], size[1]));
    if (open?.(a[0], a[1], b[0], b[1])) opens.push([a[0], a[1], b[0], b[1]]);   // open: the water runs on (an arch's mouth)
    else if (!border) segs.push([a[0], a[1], b[0], b[1]]);
  }
  const dist = (px: number, py: number, list: number[][]) => {
    let d = MAX_D;
    for (const [ax, ay, bx, by] of list) {
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
      d = Math.min(d, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    return d;
  };
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = box.x0 + i * cell, py = box.y0 + j * cell;
    let inside = false;
    for (const [ax, ay, bx, by] of all) if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
    const d = dist(px, py, segs);
    // just past an open edge it is still water (no gap where the stream meets the water under an arch)
    if (!inside && opens.length && dist(px, py, opens) < d) inside = true;
    const sd = inside ? d : -Math.min(d, MAX_D);
    data[j * W + i] = Math.round((0.5 + 0.5 * Math.max(-1, Math.min(1, sd / MAX_D))) * 255);
  }
  return { data, W, H };
}

/** Which way a body of water flows, and how fast (tiles of 8 u a second): a long narrow one (a stream) along its length, faster. */
export function flowOf(outer: Ring): [number, number] {
  let mx = 0, my = 0;
  for (const [x, y] of outer) { mx += x; my += y; }
  mx /= outer.length; my /= outer.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of outer) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy, l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = tr - l1;
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (l2 > 1e-9 && l1 / l2 > 9) return [Math.cos(ang) * 0.06, Math.sin(ang) * 0.06];   // elongated: a stream
  return [0.012, 0.007];                                                                // the sea: a slow drift
}

/** The water's colours (linear-ish sRGB): shallow, deep, the cell lines, the foam. */
export const WATER = { shallow: 0x4fc3c0, deep: 0x13607e, lines: 0xa8ecef, foam: 0xf4fbf8 };

// noise for the shader: a hash, smooth value noise, its fractal sum, and Worley (F1, F2) with points that wander
const NOISE = /* glsl */ `
  vec2 wHash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  float wHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
  float wNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
  }
  float wFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * wNoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; } return s; }
  vec2 wWorley(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y)), o = wHash2(i + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);                      // each point wanders on its own little orbit
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return vec2(d1, d2);
  }`;

/** A body of water: a grid over its box (for the swell), cut to its outline in the shader. */
export function waterMesh(rings: Ring[], y: number, size: [number, number], time: { value: number }, tile = 8, open?: (ax: number, ay: number, bx: number, by: number) => boolean): THREE.Mesh {
  const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1]);
  const box = { x0: Math.min(...xs) - 0.5, y0: Math.min(...ys) - 0.5, x1: Math.max(...xs) + 0.5, y1: Math.max(...ys) + 0.5 };
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const f = shoreField(rings, box, 0.5, size, open);
  const sdf = new THREE.DataTexture(f.data, f.W, f.H, THREE.RedFormat, THREE.UnsignedByteType);
  sdf.magFilter = sdf.minFilter = THREE.LinearFilter; sdf.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(bw, bh, Math.min(256, Math.ceil(bw)), Math.min(256, Math.ceil(bh))).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0 });
  const [fx, fy] = flowOf(rings[0]), speed = Math.hypot(fx, fy) * tile, stream = Math.hypot(fx, fy) > 0.03;
  const col = (c: number) => new THREE.Color(c);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      wSdf: { value: sdf }, wBox: { value: new THREE.Vector4(box.x0, box.y0, (f.W - 1) * 0.5, (f.H - 1) * 0.5) }, wTime: time,
      wDir: { value: new THREE.Vector2(fx, fy).normalize() }, wSpeed: { value: speed }, wStream: { value: stream ? 1 : 0 }, wSwell: { value: 0.07 },
      wShallow: { value: col(WATER.shallow) }, wDeep: { value: col(WATER.deep) }, wLine: { value: col(WATER.lines) }, wFoamC: { value: col(WATER.foam) },
    });
    const decl = '\nuniform sampler2D wSdf;\nuniform vec4 wBox;\nuniform float wTime, wSwell, wSpeed, wStream;\nuniform vec2 wDir;\nuniform vec3 wShallow, wDeep, wLine, wFoamC;\nvarying vec3 vWPos;\nvarying float vSd, vSw;';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>${decl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float sd0 = (texture2D(wSdf, (wp0.xz - wBox.xy) / wBox.zw).r - 0.5) * 2.0;
        float sw = sin(dot(wp0.xz, vec2(0.11, 0.07)) + wTime * 0.6) + 0.6 * sin(dot(wp0.xz, vec2(-0.05, 0.13)) + wTime * 0.43) + 0.3 * sin(dot(wp0.xz, vec2(0.21, -0.17)) + wTime * 0.9);
        transformed.y += wSwell * smoothstep(0.0, 0.4, sd0) * sw;   // a slow swell, calm at the shore
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vSd = sd0; vSw = sw;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${decl}${NOISE}`)
      .replace('#include <map_fragment>', `
        if (vSd < -0.06) discard;   // outside the outline (a quarter u of grace: the field is coarse, and walls cover the overlap)
        float t = wTime, d = vSd * ${MAX_D.toFixed(1)};                 // d: u to the shore
        // the pattern's space: world u at about a 4 u cell; a stream's is turned to its flow and stretched along it
        vec2 p = vWPos.xz * 0.25;
        if (wStream > 0.5) p = vec2(dot(p, wDir) * 0.55, dot(p, vec2(-wDir.y, wDir.x)));
        p -= (wStream > 0.5 ? vec2(1.0, 0.0) : wDir) * wSpeed * 0.25 * t;
        // domain warp: bend the coordinates with drifting smooth noise, so the cells swirl instead of sliding
        vec2 w = vec2(wFbm(p * 0.6 + vec2(0.0, t * 0.07)), wFbm(p * 0.6 + vec2(5.2, -t * 0.06)));
        vec2 q = p + 1.4 * (w - 0.5);
        vec2 c1 = wWorley(q * 0.75, t * 0.5);
        float l1 = 1.0 - smoothstep(0.0, 0.07, c1.y - c1.x);
        // the lines show in patches that come and go (sparse highlights, not a net over everything)
        float wPatch = smoothstep(0.42, 0.68, wFbm(p * 0.45 + vec2(t * 0.04, -t * 0.03)));
        // colour by depth (the shore's distance), with a broad, slow variation so no two places match
        vec3 c = mix(wShallow, wDeep, smoothstep(0.2, ${MAX_D.toFixed(1)}, d));
        c *= 0.9 + 0.2 * wFbm(p * 0.35 + t * 0.03) + 0.05 * vSw;
        c = mix(c, wLine, l1 * 0.5 * (0.25 + 0.75 * wPatch));
        // shore foam: noise against a cutoff that falls toward the shore (solid at the edge, patches further out)
        float n = wNoise(q * 3.2 + vec2(t * 0.35, -t * 0.25)) * 0.65 + wNoise(q * 7.0 - t * 0.5) * 0.35;
        float cut = clamp(d / 1.3, 0.0, 1.0) * 0.85 + 0.08;
        float foam = smoothstep(cut - 0.04, cut + 0.04, n);
        // and rings rolling in toward the shore, broken up by the same noise
        float ring = smoothstep(0.82, 0.92, 0.5 + 0.5 * sin(d * 3.4 + t * 1.7 + w.y * 3.0)) * (1.0 - smoothstep(0.4, 2.2, d)) * step(0.42, n);
        foam = max(foam, ring);
        c = mix(c, wFoamC, foam);
        // glints: the brightest specks of a fine noise, twinkling where the lines are
        float sp = wNoise(vWPos.xz * 2.6 + vec2(t * 0.9, -t * 0.7)) * wNoise(vWPos.xz * 3.7 - vec2(t * 0.6, t * 1.1));
        c += smoothstep(0.66, 0.82, sp) * 0.5 * l1 * wPatch * (1.0 - foam);   // glints, only on the bright lines
        diffuseColor.rgb = c;`);
  };
  mat.customProgramCacheKey = () => 'water-toon';
  const m = new THREE.Mesh(geo, mat);
  m.position.set(box.x0 + bw / 2, y, box.y0 + bh / 2);
  m.receiveShadow = true;
  return m;
}
