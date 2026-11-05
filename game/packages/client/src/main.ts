/**
 * Boot and the fixed-step loop. The loop is the only place real time exists: it decides how
 * many 60 Hz sim steps to run this frame, feeds each one a recorded input, then draws once
 * with the leftover fraction as the interpolation alpha.
 *
 * URL params:
 *   ?script=1     both wizards play the scripted run (for headless screenshots; the loop then uses setTimeout,
 *                 because headless Chrome's virtual time doesn't advance requestAnimationFrame)
 *   ?selftest=1   no rendering: run the golden replay and publish its hash on <html data-hash>
 *   ?autoplay=1   the Arena with bots piloting seats 0 and 1 (setTimeout loop too: the way to screenshot enemies and waves)
 *   ?spell=arcane+fire/force   both seats cast chosen spells at the dummies (demo.ts; &spell2= for seat 1)
 *   ?room=arena   play the Arena (waves of enemies) instead of the Sanctum's dummies; ?room=survive (or #survive):
 *                 Survive, endless waves in a walled arena with a power-up pick between them
 *   ?scale=N      force the integer pixel scale
 *   ?debug=0      hide the debug line (tick, hash); the backquote key toggles it
 *   ?renderer=webgpu   try WebGPU instead of WebGL
 *   ?scene=rally  with ?room=survive and a headless loop: a Rally in progress, nobody pressing anything (demo.ts)
 *   ?scene=three  the same, but the pick with +1 to three half chosen and some pools refilling
 *   ?local=N      the camera follows seat N only, as a networked player's screen would (others get edge arrows)
 *   ?pauseAt=N    pause the sim at tick N (like P in the tuning panel; cosmetic animation keeps running)
 *   ?tune=1       open the tuning panel at boot (F1 or the Tune button toggles it; tune-panel.ts)
 *   ?net=bc       online co-op between tabs of this page on one machine (BroadcastChannel), for testing
 *                 alone; on claude.ai the Co-op panel uses the artifact's room instead (net/)
 */
import { Application } from 'pixi.js';
import { TextureSource } from 'pixi.js';
import {
  DT, MAX_SEATS, NO_INPUT, ReplayRecorder, botInput, createWorld, hashWorld, hex, newBotMemory, runReplay, scriptedInput, scriptedReplay, step,
  type PlayerInput, type Room,
} from '@wizard-sim/sim';
import { demoInput, parseDemo, rallyScene, threeScene } from './demo';
import { PadSeats } from './gamepad';
import { KeyboardMouse } from './input';
import { TunePanel } from './tune-panel';
import { Inspect } from './inspect';
import { loadSaved } from './tune-io';
import { WorldView } from './view';
import { broadcastBus, roomBus } from './net/bus';
import { webrtcBus } from './net/webrtc';
import { NetPlay } from './net/netplay';

const params = new URLSearchParams(location.search);
// Artifact links carry no query string, only a plain #anchor: #arena, #ally or #arena-ally work there too.
for (const tok of location.hash.slice(1).split('-')) {
  if (tok === 'arena') params.set('room', 'arena');
  if (tok === 'survive') params.set('room', 'survive');
  if (tok === 'ally') params.set('ally', '1');
}
// 1 / 2 / 3 switch between the Sanctum (dummies), the Arena (waves) and Survive, keeping the ally choice.
addEventListener('keydown', (e) => {
  if (e.code !== 'Digit1' && e.code !== 'Digit2' && e.code !== 'Digit3') return;
  const toks = [e.code === 'Digit2' ? 'arena' : e.code === 'Digit3' ? 'survive' : 'sanctum', ...(params.get('ally') === '1' ? ['ally'] : [])];
  location.hash = toks.join('-');
  location.reload();
});
const hud = document.getElementById('hud')!;

if (params.get('selftest') === '1') selftest();
else void boot();

/** Runs the golden replay with no rendering, for scripts/browser-check.mjs. */
function selftest(): void {
  const ticks = Number(params.get('ticks') ?? 1800);
  const r = runReplay(scriptedReplay(ticks));
  document.documentElement.dataset.hash = hex(r.hash);
  document.documentElement.dataset.trail = r.trail.map(hex).join(',');
  hud.textContent = `selftest ${ticks} ticks: ${hex(r.hash)}`;
}

async function boot(): Promise<void> {
  const scripted = params.get('script') === '1';
  const autoplay = params.get('autoplay') === '1';
  const demo = [parseDemo(params.get('spell')), parseDemo(params.get('spell2') ?? params.get('spell'))];
  const headless = scripted || autoplay || !!demo[0];
  const asked = params.get('room');
  const room: Room = asked === 'survive' ? 'survive' : autoplay || asked === 'arena' ? 'arena' : 'sanctum';
  TextureSource.defaultOptions.scaleMode = 'nearest';
  // Headless runs seat two wizards. Interactive play starts with you alone; gamepads join seats 1-3
  // with any button, and ?ally=1 puts a bot wizard on seat 1 (a dev ally for trying co-op solo).
  const ally = params.get('ally') === '1';
  const players = headless ? 2 : ally ? 2 : 1;
  const host = document.getElementById('app')!;

  const app = new Application();
  await app.init({
    resizeTo: host,
    antialias: false,
    autoStart: false,
    resolution: 1,
    roundPixels: true,
    background: '#0e1712', // the grass at the edge of the floor, in dusk
    // Headless screenshots read the canvas after the frame was presented.
    preserveDrawingBuffer: headless,
    preference: params.get('renderer') === 'webgpu' ? 'webgpu' : 'webgl',
  });
  app.ticker.stop();
  host.appendChild(app.canvas);

  let showDebug = params.get('debug') !== '0';
  hud.style.display = showDebug ? '' : 'none';
  addEventListener('keydown', (e) => { if (e.code === 'Backquote') { showDebug = !showDebug; hud.style.display = showDebug ? '' : 'none'; } });
  const view = new WorldView();
  view.lightsOn = params.get('lights') !== '0';
  // ?ally=1's bot stands in for a partner on another screen: the camera doesn't follow it
  if (ally && !headless) view.isLocal = (s) => s !== 1;
  // tests and screenshots: ?local=0 frames seat 0 only (the others get edge arrows)
  const onlySeat = params.get('local');
  if (onlySeat !== null && onlySeat !== '') { const k = Number(onlySeat); view.isLocal = (s) => s === k; }
  app.stage.addChild(view.root);
  const fit = () => view.resize(host.clientWidth, host.clientHeight, Number(params.get('scale')) || undefined);
  fit();
  addEventListener('resize', fit);

  // the saved tuning goes in before the world exists, so spawn-time numbers (hp, radii) use it too
  loadSaved();
  const world = createWorld(7, players, { room });
  // ?scene=rally / ?scene=three (Survive, headless): a rally in progress, or +1 to three being chosen, for screenshots (demo.ts)
  const sceneName = headless && world.run ? params.get('scene') : null;
  const scene = sceneName === 'rally' || sceneName === 'three';
  if (sceneName === 'rally') rallyScene(world);
  if (sceneName === 'three') threeScene(world);
  const bots = [newBotMemory(), newBotMemory()];
  const pads = new PadSeats();
  const keyboard = new KeyboardMouse(app.canvas, view.camera);
  const recorder = new ReplayRecorder(7, MAX_SEATS);
  const tune = new TunePanel(world, view.camera, app.canvas, params.get('tune') === '1');
  const inspect = new Inspect(world, view.camera);

  const inputsFor = (tick: number): PlayerInput[] => {
    const out: PlayerInput[] = [];
    if (headless) {
      for (let p = 0; p < MAX_SEATS; p++) out.push(p >= players || scene ? NO_INPUT : autoplay ? botInput(world, p, bots[p]) : demo[0] ? (demo[p] ? demoInput(world, tick, p, demo[p]!) : NO_INPUT) : scriptedInput(tick, p));
      return out;
    }
    pads.poll((seat) => world.seats.active[seat] === 1 || (ally && seat === 1));
    for (let p = 0; p < MAX_SEATS; p++) {
      if (p === 0) out.push(keyboard.sample(world, 0));
      else if (ally && p === 1) out.push(botInput(world, 1, bots[1]));
      else out.push(pads.sample(p) ?? NO_INPUT);
    }
    return out;
  };

  // Online co-op: the artifact's room on claude.ai, or other tabs with ?net=bc. Nothing headless.
  let net: NetPlay | null = null;
  if (!headless) {
    // On claude.ai: the artifact's room. Elsewhere (the dev server, a hosted page): WebRTC, or tabs with ?net=bc.
    const bus = params.get('net') === 'bc' ? broadcastBus() : (await roomBus()) ?? webrtcBus();
    if (bus) net = new NetPlay(bus, world, room, () => {
      acc = 0;
      // While rollback replays ticks it already showed, skip effects and meters (they'd play twice);
      // the view only notes remote spells the replay started, to show them from their first frame.
      const s = net!.session!;
      view.setLocalSeat(net!.seat);
      s.hooks = {
        before: (w) => { net!.beforeTick(w.clock[0]); view.beforeStep(w); }, after: (w) => { if (!s.replaying) { view.afterStep(w); tune.afterStep(); } else view.replayStep(w); },
        preRewind: (w) => view.notePreRewind(w), postRewind: (w) => view.notePostRewind(w, net!.seat),
      };
    });
    if (net) {
      tune.addSection('Network test', (body) => net!.attachDebug(body, view));
      const n = net;
      tune.gate = { online: () => n.state === 'playing', canTune: () => n.canTune, propose: (map) => n.proposeTuning(map) };
      n.onTuning = () => tune.refresh();
    }
  }

  const runStep = () => {
    const inputs = inputsFor(world.clock[0]);
    recorder.record(inputs);
    view.beforeStep(world);
    step(world, inputs);
    view.afterStep(world);
    tune.afterStep();
  };

  // Fixed step: real time accumulates, the sim consumes it in DT slices (at most 8 per frame).
  // The panel's time scale changes how much real time feeds the accumulator; DT itself never changes.
  let acc = 0;
  let last = performance.now();
  /** Online: our input goes in `delay` ticks ahead; a tick runs once every seat's input is in. */
  const netSteps = (now: number) => {
    net!.pump(now);
    const s = net!.session;
    if (!s) return; // dropped from the match just now
    const tick = () => {
      // Keep our inputs `delay` ticks ahead (the delay follows the round trip, so this may push several).
      while (s.nextScheduled <= world.clock[0] + s.delay) s.pushLocal(keyboard.sample(world, net!.seat));
      return s.advance(1) > 0;
    };
    acc = Math.min(acc + (now - last) / 1000, 8 * DT);
    while (acc >= DT) {
      if (!tick()) break; // waiting on someone: keep the time, catch up when it arrives
      acc -= DT;
    }
    // Behind the others (a tab that was hidden, or one that just rejoined): run a few extra ticks a frame.
    for (let k = Math.min(6, s.lag - 2); k > 0; k--) if (!tick()) break;
  };
  // ?pauseAt=N pauses the sim at tick N as the tuning panel's P does (for checking that cosmetic
  // animation keeps running on real time while the sim stands still)
  const pauseAt = Number(params.get('pauseAt')) || 0;
  const frame = () => {
    const now = performance.now();
    if (pauseAt && world.clock[0] >= pauseAt && !tune.paused) tune.paused = true;
    if (net?.state === 'playing') netSteps(now);
    else if (tune.paused) for (let n = tune.takeSteps(); n > 0; n--) runStep();
    else {
      acc = Math.min(acc + ((now - last) / 1000) * tune.timeScale, 8 * DT);
      while (acc >= DT) { runStep(); acc -= DT; }
    }
    last = now;
    tune.frame(now);
    inspect.frame();
    try {
      view.draw(world, acc / DT, now);
      app.render();
    } catch (err) {
      // keep the loop alive and say what broke (a frozen frame is much harder to debug)
      hud.style.display = '';
      hud.textContent = `draw error at tick ${world.clock[0]}: ${(err as Error).stack ?? err}`;
      schedule(frame);
      return;
    }
    // the debug line: small, and only hashed when shown (hashing walks every state byte)
    if (showDebug && world.clock[0] % 6 === 0) hud.textContent = `tick ${world.clock[0]}  hash ${hex(hashWorld(world))}  ${view.camera.scale}×  ${app.renderer.name}
${view.debug()}${tune.flags()}${net?.flags() ?? ''}` +
      (autoplay ? '  autoplay' : demo[0] ? '  spell demo' : scripted ? '  scripted run' : '\nLMB walk · RMB Force (hold) · Shift+RMB Area, hold for Place · Space Self · Shift+LMB Weapon · Esc clear · hold Alt: inspect' +
        '\nNothing queued: RMB Strike, hold for the weapon’s Heavy · Shift+RMB Special · Shift+LMB your guard’s Retreat (or a hop) · Space Defend: hold to block, tap as a hit lands to parry');
    schedule(frame);
  };
  // ?timerloop=1: timers instead of animation frames, so a background tab keeps running (the co-op e2e test).
  const schedule = headless || params.get('timerloop') === '1' ? (f: () => void) => setTimeout(f, 1000 / 60) : (f: () => void) => requestAnimationFrame(f);
  schedule(frame);

  // Expose the recorder for debugging: copy a replay of this session from the console.
  (window as unknown as { wizardSim: unknown }).wizardSim = { world, recorder, tune, view, get net() { return net; } };
}
