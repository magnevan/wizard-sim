/**
 * Water for the kit renderer (kit-render.ts): a floor of mat 'water' drawn as a gently moving surface. The painted
 * texture (content/generated/textures/water.png) carries the whole look; the shader only moves and lights it: two
 * copies at different scales drifting different ways, ripple normals from the painting's own light and dark, a slow
 * swell, a lighter sheen toward grazing angles, and foam along the shore made by lightening the painting there.
 * The shore comes from the compiler's floor outline: a small signed distance field per body of water.
 */
import * as THREE from 'three';

export type Ring = number[][];
/** Distance to shore stored as 0..1 = -MAX_D..+MAX_D u (inside the water is positive). */
export const MAX_D = 4;

/**
 * A body of water's shore field over its box, every `cell` u: the signed distance (u) to the nearest shore. A shore is
 * an outline segment that isn't on the map's border (the sea running off the map edge has no foam there).
 */
export function shoreField(rings: Ring[], box: { x0: number; y0: number; x1: number; y1: number }, cell: number, size: [number, number]) {
  const W = Math.max(2, Math.ceil((box.x1 - box.x0) / cell) + 1), H = Math.max(2, Math.ceil((box.y1 - box.y0) / cell) + 1);
  const on = (v: number, lim: number) => Math.abs(v - lim) < 1e-3;
  const segs: number[][] = [], all: number[][] = [];
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    all.push([a[0], a[1], b[0], b[1]]);
    const border = (on(a[0], 0) && on(b[0], 0)) || (on(a[0], size[0]) && on(b[0], size[0])) || (on(a[1], 0) && on(b[1], 0)) || (on(a[1], size[1]) && on(b[1], size[1]));
    if (!border) segs.push([a[0], a[1], b[0], b[1]]);
  }
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = box.x0 + i * cell, py = box.y0 + j * cell;
    let inside = false;
    for (const [ax, ay, bx, by] of all) if ((ay > py) !== (by > py) && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) inside = !inside;
    let d = MAX_D;
    for (const [ax, ay, bx, by] of segs) {
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
      d = Math.min(d, Math.hypot(px - ax - t * dx, py - ay - t * dy));
    }
    const sd = inside ? d : -Math.min(d, MAX_D);
    data[j * W + i] = Math.round((0.5 + 0.5 * Math.max(-1, Math.min(1, sd / MAX_D))) * 255);
  }
  return { data, W, H };
}

/** Which way a body of water flows, and how fast (tiles a second): a long narrow one (a stream) along its length, faster. */
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

/** A body of water as a moving surface: a grid over its box (for the swell), cut to its outline in the shader. */
export function waterMesh(rings: Ring[], y: number, size: [number, number], tex: THREE.Texture, time: { value: number }, tile = 8): THREE.Mesh {
  const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1]);
  const box = { x0: Math.min(...xs) - 0.5, y0: Math.min(...ys) - 0.5, x1: Math.max(...xs) + 0.5, y1: Math.max(...ys) + 0.5 };
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const f = shoreField(rings, box, 0.5, size);
  const sdf = new THREE.DataTexture(f.data, f.W, f.H, THREE.RedFormat, THREE.UnsignedByteType);
  sdf.magFilter = sdf.minFilter = THREE.LinearFilter; sdf.needsUpdate = true;
  const geo = new THREE.PlaneGeometry(bw, bh, Math.min(256, Math.ceil(bw)), Math.min(256, Math.ceil(bh))).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0 });
  const flow = flowOf(rings[0]);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      wMap: { value: tex }, wSdf: { value: sdf }, wBox: { value: new THREE.Vector4(box.x0, box.y0, (f.W - 1) * 0.5, (f.H - 1) * 0.5) },
      wScale: { value: 1 / tile }, wTime: time, wFlow: { value: new THREE.Vector2(...flow) }, wSwell: { value: 0.06 },
    });
    const decl = '\nuniform sampler2D wMap, wSdf;\nuniform vec4 wBox;\nuniform float wScale, wTime, wSwell;\nuniform vec2 wFlow;\nvarying vec3 vWPos;\nvarying float vSd;';
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>${decl}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float sd0 = (texture2D(wSdf, (wp0.xz - wBox.xy) / wBox.zw).r - 0.5) * 2.0;
        // a slow swell over a long wavelength, calm at the shore
        transformed.y += wSwell * smoothstep(0.0, 0.4, sd0) * (sin(dot(wp0.xz, vec2(0.11, 0.07)) + wTime * 0.6) + 0.6 * sin(dot(wp0.xz, vec2(-0.05, 0.13)) + wTime * 0.43));
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vSd = sd0;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${decl}
        float wLum(vec2 uv) { return dot(texture2D(wMap, uv).rgb, vec3(0.299, 0.587, 0.114)); }`)
      .replace('#include <map_fragment>', `
        if (vSd < 0.0) discard;                                              // outside the water's outline
        vec2 wuv1 = vWPos.xz * wScale + wFlow * wTime;
        vec2 wuv2 = mat2(0.8, -0.6, 0.6, 0.8) * vWPos.xz * wScale * 1.7 - wFlow.yx * wTime * 1.3;
        vec4 wc = mix(texture2D(wMap, wuv1), texture2D(wMap, wuv2), 0.45);  // the painting, twice, drifting apart
        float wView = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        wc.rgb *= mix(0.72, 1.2, pow(1.0 - wView, 2.0));                    // darker straight down, lighter toward grazing
        float wD = vSd * ${MAX_D.toFixed(1)}, wL = dot(wc.rgb, vec3(0.299, 0.587, 0.114));
        float wFoam = (1.0 - smoothstep(0.0, 0.9, wD)); wFoam *= smoothstep(0.2, 0.7, wL + wFoam * 0.6);
        wc.rgb = mix(wc.rgb, min(vec3(1.0), wc.rgb * 1.7 + 0.28), wFoam);  // foam: the painting, lightened, at the shore
        diffuseColor *= wc;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {   // ripples: the painting's light and dark as height, both copies
          float we = 0.012;
          float hx = wLum(wuv1 + vec2(we, 0.0)) - wLum(wuv1 - vec2(we, 0.0)) + wLum(wuv2 + vec2(we, 0.0)) - wLum(wuv2 - vec2(we, 0.0));
          float hz = wLum(wuv1 + vec2(0.0, we)) - wLum(wuv1 - vec2(0.0, we)) + wLum(wuv2 + vec2(0.0, we)) - wLum(wuv2 - vec2(0.0, we));
          normal = normalize((viewMatrix * vec4(normalize(vec3(-hx * 1.6, 1.0, -hz * 1.6)), 0.0)).xyz);
        }`);
  };
  mat.customProgramCacheKey = () => 'water';
  const m = new THREE.Mesh(geo, mat);
  m.position.set(box.x0 + bw / 2, y, box.y0 + bh / 2);
  m.receiveShadow = true;
  return m;
}
