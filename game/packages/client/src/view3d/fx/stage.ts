/**
 * How the effects are drawn into a frame. The world renders into an HDR, multisampled target whose depth is kept as a
 * texture; the effects then draw into the same target, depth-tested against the world in hardware and softened near it
 * with that depth texture (no feedback loop: with multisampling, drawing goes to the target's renderbuffers and the
 * texture is the resolved copy). Last, three's OutputPass tone-maps the target to the screen with the renderer's own
 * tone mapping (the kit's ACES), so a flame's HDR core rolls off into white the way the sun's highlights do.
 *
 * A host (the lab today, the 3D game view later) owns the renderer, the world scene and the camera, and calls
 * `render()` once a frame instead of `renderer.render()`.
 */
import * as THREE from 'three';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Uniforms every effect reads, shared by reference: the world's resolved depth, the target's size and the camera's range. */
export const FX_U = {
  uDepth: { value: null as THREE.Texture | null },
  uRes: { value: new THREE.Vector2(1, 1) },
  uNear: { value: 0.5 },
  uFar: { value: 500 },
};

/**
 * The haze pass: each pixel of the frame read from a little way off, by the offset (in pixels, xy) the distortion
 * meshes drew there; light bending round something hot (the user, on the Arcane beam, 2026-11-25).
 */
const HAZE = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: null }, tOff: { value: null }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D tColor, tOff; uniform vec2 uRes; varying vec2 vUv; void main() { vec2 o = clamp(texture2D(tOff, vUv).xy, -3.0, 3.0); gl_FragColor = texture2D(tColor, vUv + o / uRes); }',
  depthTest: false, depthWrite: false,
});

export class FxStage {
  /**
   * Distortion: meshes here draw a screen offset in pixels (rg, added together; b only keeps a fragment from being
   * discarded), and the frame is bent by it before the tone map. Drawn with the effects' camera, depth-faded like them.
   */
  readonly distort = new THREE.Scene();
  private rtOff: THREE.WebGLRenderTarget | null = null;
  private rtBent: THREE.WebGLRenderTarget | null = null;
  private quad = new FullScreenQuad(HAZE);
  /** The effects: particle batches and ground decals go here, never in the world scene. */
  readonly scene = new THREE.Scene();
  private rt: THREE.WebGLRenderTarget | null = null;
  private out = new OutputPass();
  /** Draw calls and triangles of the effects alone in the last frame (renderer.info, for the lab's stats). */
  readonly stats = { calls: 0, triangles: 0 };

  /**
   * The world and its effects, tone-mapped to the screen. `box` (CSS px from the canvas's bottom left, as
   * renderer.setViewport takes it) draws into that part of the canvas only, leaving the rest as it was (a lab's film
   * strip); the camera's aspect should match it. `fxCamera` draws the effects when their space is the world's moved
   * (the game view: effects in sim space, the kit scene offset by the room's toScene); it must share `camera`'s lens.
   */
  render(renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.PerspectiveCamera, box?: { x: number; y: number; w: number; h: number }, fxCamera: THREE.Camera = camera): void {
    const pr = renderer.getPixelRatio();
    const size = box ? new THREE.Vector2(Math.round(box.w * pr), Math.round(box.h * pr)) : renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.rt || this.rt.width !== size.x || this.rt.height !== size.y) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y) });
    }
    FX_U.uDepth.value = this.rt.depthTexture; FX_U.uRes.value.copy(size); FX_U.uNear.value = camera.near; FX_U.uFar.value = camera.far;
    const auto = renderer.autoClear;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(world, camera);
    renderer.autoClear = false;
    const c0 = renderer.info.autoReset ? 0 : renderer.info.render.calls, t0 = renderer.info.autoReset ? 0 : renderer.info.render.triangles;
    renderer.render(this.scene, fxCamera);   // with autoReset (the default) the counters now hold the effects alone
    this.stats.calls = renderer.info.render.calls - c0; this.stats.triangles = renderer.info.render.triangles - t0;
    let src = this.rt;
    if (this.distort.children.some((c) => c.visible && c.children.some((m) => m.visible))) {
      if (!this.rtOff || this.rtOff.width !== size.x || this.rtOff.height !== size.y) {
        this.rtOff?.dispose(); this.rtBent?.dispose();
        this.rtOff = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
        this.rtBent = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, depthBuffer: false });
      }
      const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
      renderer.setRenderTarget(this.rtOff); renderer.setClearColor(0x000000, 0); renderer.clear();
      renderer.render(this.distort, fxCamera);
      renderer.setClearColor(cc, ca);
      HAZE.uniforms.tColor.value = this.rt.texture; HAZE.uniforms.tOff.value = this.rtOff.texture; HAZE.uniforms.uRes.value.copy(size);
      renderer.setRenderTarget(this.rtBent); this.quad.render(renderer);
      src = this.rtBent!;
    }
    renderer.autoClear = auto;
    renderer.setRenderTarget(null);
    if (box) { renderer.setViewport(box.x, box.y, box.w, box.h); renderer.setScissor(box.x, box.y, box.w, box.h); renderer.setScissorTest(true); }
    this.out.render(renderer, null as unknown as THREE.WebGLRenderTarget, src, 0, false);
    if (box) { const s = renderer.getSize(new THREE.Vector2()); renderer.setViewport(0, 0, s.x, s.y); renderer.setScissorTest(false); }
  }

  dispose(): void { this.rt?.dispose(); this.rtOff?.dispose(); this.rtBent?.dispose(); this.quad.dispose(); this.out.dispose(); }
}
