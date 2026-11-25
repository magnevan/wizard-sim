/**
 * The 3D page's boot and loop (play3d.html, the port to 3D: docs/explorations/2026-11-25-port-3d-plan.md). The same
 * fixed-step loop, input, panels, menu, audio and netplay as main.ts, with the 3D view (view3d/) in place of the pixel
 * one. It's a copy of main.ts's boot rather than a split of it, so the deployed pixel game can't change while the port
 * is under way; at the swap (decision 7) this becomes main.ts and the pixel boot goes.
 *
 * Left out, for now: the help panel (F1: its live preview is a tiny Pixi world), the Pixel scale and Lights settings,
 * the Academy's prop keys, the Sound Lab, ?scene= and ?spell= demos. The report box's picture is the 3D canvas without
 * the panels. The page starts in the court; the number keys don't switch rooms (only the court has a 3D scene).
 *
 * ?cam=26 sets the view's distance (u of ground in view), ?fade=0 turns fading off, ?kitart=0 draws the kit as
 * greybox, ?runes=1 gives every wizard the usual rune pools in any room (casting in the court), ?shot=plaza / wall / fire sets a scene for scripts/play3d-shot.mjs (window.__ready, window.__perf).
 */
import {
  ARCH, DT, KEYED_EL, MAX_SEATS, NO_INPUT, RUNES, elementName, ReplayRecorder, botInput, partyOf, createWorld, devRefillRunes, devSpawnEnemy, devStartWave, hashWorld, hex, newBotMemory, replaceWorld, step,
  type Mode, type PartyState, type PlayerInput, type Room,
} from '@wizard-sim/sim';
import { demoInput, parseDemo } from './demo';
import { PadSeats } from './gamepad';
import { SaveWatch } from './saves';
import { KeyboardMouse } from './input';
import { TunePanel } from './tune-panel';
import { ToolsPanel } from './tools-panel';
import { StatsPanel } from './stats-panel';
import { Inspect } from './inspect';
import { loadSaved } from './tune-io';
import { broadcastBus, roomBus } from './net/bus';
import { webrtcBus } from './net/webrtc';
import { NetPlay } from './net/netplay';
import { EscMenu, type Setting } from './menu';
import { ReportBox } from './report';
import { GameAudio, loadVolumes, volumeSettings } from './audio/game-audio';
import { MENU_SECTIONS, onOption, opt, optNum, optOn, seedOpt, setOpt } from './dev-options';
import { fromLocation, hashFor, scenarioById, scenarioOfRoom, worldFor, type Scenario } from './scenarios';
import { View3D } from './view3d/view3d';
import { setSceneOrigin, simX, simY } from './view3d/scene-map';

const start = fromLocation(location.search, location.hash);
if (start.ally) seedOpt('ally', '1');
const hud = document.getElementById('hud')!;

/**
 * A shot's scene: where the wizards and goblins stand (scene u, so it doesn't move with the offset). With `spell`, seat
 * 0 casts it (demo.ts's notation, aimed at `at`, scene u) and the sim runs `ticks` before the shot, the court's no-runes
 * rule lifted for it; with `casts`, each seat casts its own (`lag` ticks behind the clock; demoInput's own lag of 37 ticks
 * a seat is undone); otherwise nobody moves.
 */
interface ShotCast { spell: string; at: [number, number]; lag?: number }
const SHOTS: Record<string, { wiz: [number, number][]; gob: [number, number][]; face?: number; spell?: string; at?: [number, number]; ticks?: number; casts?: ShotCast[] }> = {
  // the plaza, south of the armillary's dais: two wizards facing an arc of six goblins
  plaza: { wiz: [[91.5, 95.5], [98.5, 95.5]], gob: [[83, 91], [86.5, 89.5], [90.5, 88.8], [99.5, 88.8], [103.5, 89.5], [107, 91]], face: 0.75 },
  // a wizard just north of the great hall (95.5, 34; 26 x 12 u, 16 m tall), with a goblin in front of the hall to compare
  wall: { wiz: [[95.5, 25.5], [104, 46]], gob: [[90, 44], [100, 45]], face: 0.25 },
  // Fire spray (three runes) at the goblins, look B, 70 ticks in: the spray, and the floor it set burning
  fire: { wiz: [[95, 96]], gob: [[90, 89.5], [95, 88.8], [100, 89.5]], face: 0.75, spell: 'fire+fire+fire/force', at: [95, 89], ticks: 70 },
  // a fight on the plaza, every spell a stand-in but the Fire: an arc, a beam, ice shards and a rock wall drawn, at a warband
  fight: {
    wiz: [[87, 97], [93, 98.5], [99, 98.5], [105, 97]], gob: [[84, 89], [88, 88], [92, 88.5], [97, 88], [101, 88.5], [106, 89], [95, 85]], face: 0.75, ticks: 92,
    casts: [
      { spell: 'lightning+lightning/force', at: [86, 89] },
      { spell: 'arcane+arcane+water/force', at: [92, 88.5], lag: 6 },
      { spell: 'water+cold+water+cold/force', at: [99, 88], lag: 30 },
      { spell: 'shield+earth/drag', at: [105, 93] },
    ],
  },
};

async function boot(): Promise<void> {
  const shotName = opt('shot');
  const shot = shotName ? SHOTS[shotName] : undefined;
  const headless = !!shot;
  // the court unless a room was asked for (?room=, #anchor)
  const asked = opt('room') !== null || /\w/.test(location.hash);
  let scenario: Scenario = asked ? start.scenario : scenarioById('court')!;
  const room = scenario.room as Room;
  const ally = optOn('ally');
  const players = headless ? Math.max(2, shot.wiz.length) : ally ? 2 : 1;
  const host = document.getElementById('app')!;

  const view = new View3D(host, { art: optOn('kitart'), preserve: headless });
  hud.style.display = '';
  hud.textContent = 'loading the court...';
  const camOpt = () => { view.camera.viewH = optNum('cam', 26); };
  camOpt(); onOption('cam', camOpt);
  const fadeOpt = () => { view.fader.enabled = optOn('fade'); };
  await view.load('court');
  fadeOpt(); onOption('fade', fadeOpt);
  hud.style.display = 'none';
  if (ally && !headless) view.isLocal = (s) => s !== 1;
  const onlySeat = opt('local');
  if (onlySeat !== null && onlySeat !== '') { const k = Number(onlySeat); view.isLocal = (s) => s === k; }
  const audio = !optOn('sound') || headless ? null : new GameAudio(loadVolumes(), true);
  view.sound = audio?.director ?? null;
  const fit = () => view.resize(host.clientWidth, host.clientHeight);
  fit();
  addEventListener('resize', fit);

  loadSaved();
  const world = createWorld(7, players, { room, checkpoint: opt('at') ?? undefined });
  /**
   * ?runes=1: the usual pools (config RUNES.max) in any room, the court's no-runes rule lifted, put back each time the
   * world's mode is replaced (a room switch). Client-side: without it the sim is untouched; online, every peer needs it.
   */
  let runesMode: Mode | null = null;
  const grantRunes = () => {
    if (!optOn('runes') || world.mode === runesMode) return;
    runesMode = { ...world.mode, runeMax: (_w, _i, id) => (id > KEYED_EL ? 0 : RUNES.max[elementName(id)]) };
    world.mode = runesMode;
    for (let s = 0; s < MAX_SEATS; s++) if (world.seats.active[s]) devRefillRunes(world, s);
  };
  grantRunes();
  if (shot) {
    setSceneOrigin(world.def);
    shot.wiz.forEach(([x, y], s) => { world.bodies.x[s] = simX(x); world.bodies.y[s] = simY(y); world.bodies.face[s] = shot.face ?? 0.75; });
    for (const [x, y] of shot.gob) { const i = devSpawnEnemy(world, ARCH.swarmer, simX(x), simY(y)); if (i >= 0) world.bodies.face[i] = ((shot.face ?? 0.75) + 0.5) % 1; }
    view.beforeStep(world);
    const casts = shot.casts ?? (shot.spell ? [{ spell: shot.spell, at: shot.at! }] : []);
    if (casts.length) {
      world.mode = { ...world.mode, runeMax: () => 5 };   // the court (and the party's pools) give no runes: five each, for this shot only
      casts.forEach((_, p) => devRefillRunes(world, p));
      const ds = casts.map((c) => parseDemo(`${c.spell}@${simX(c.at[0])},${simY(c.at[1])}`)!);
      for (let k = 0; k < (shot.ticks ?? 60); k++) {
        const inputs = Array.from({ length: MAX_SEATS }, (_, p) => (ds[p] && k >= (casts[p].lag ?? 0) ? demoInput(world, k - (casts[p].lag ?? 0) + p * 37, p, ds[p]) : NO_INPUT));
        view.beforeStep(world); step(world, inputs); view.afterStep(world);
      }
    }
  }
  const saves = new SaveWatch(() => scenario);
  const bots = [newBotMemory(), newBotMemory()];
  const pads = new PadSeats();
  const keyboard = new KeyboardMouse(view.canvas, view.camera);
  let recorder = new ReplayRecorder(7, MAX_SEATS);
  const tune = new TunePanel(optOn('tune'));
  const tools = new ToolsPanel(world, view.camera, view.canvas, optOn('tools'), optOn('stage'));
  const stats = new StatsPanel(world, optOn('stats'));
  const inspect = new Inspect(world, view.camera);

  const inputsFor = (): PlayerInput[] => {
    const out: PlayerInput[] = [];
    pads.poll((seat) => world.seats.active[seat] === 1 || (ally && seat === 1));
    for (let p = 0; p < MAX_SEATS; p++) {
      if (p === 0) out.push(keyboard.sample(world, 0));
      else if (ally && p === 1) out.push(botInput(world, 1, bots[1]));
      else out.push(pads.sample(p) ?? NO_INPUT);
    }
    return out;
  };

  let net: NetPlay | null = null;
  let menu: EscMenu | null = null;
  if (!headless) {
    const bus = opt('net') === 'bc' ? broadcastBus() : (await roomBus()) ?? webrtcBus();
    if (bus) net = new NetPlay(bus, world, room, () => {
      acc = 0;
      menu?.hide();
      scenario = scenarioOfRoom(net!.roomName);
      saves.reset();
      const s = net!.session!;
      view.setLocalSeat(net!.seat);
      s.hooks = {
        before: (w) => { grantRunes(); net!.beforeTick(w.clock[0]); view.beforeStep(w); }, after: (w) => { if (!s.replaying) { view.afterStep(w); stats.afterStep(); tools.afterStep(); saves.update(w.mode.reached?.(w), partyOf(w)); checkLeave(); } else view.replayStep(w); },
        preRewind: (w) => view.notePreRewind(w), postRewind: (w) => view.notePostRewind(w, net!.seat),
      };
    });
    if (net) {
      tools.addSection('Network test', (body) => net!.attachDebug(body, view));
      const n = net;
      tune.gate = { online: () => n.state === 'playing', canTune: () => n.canTune, propose: (map) => n.proposeTuning(map) };
      tools.online = () => n.state === 'playing';
      n.onTuning = () => tune.refresh();
    }
  }

  /** A campaign area the party walks out of (Mode.leaveTo: the court's gates) hands over to the next, once. */
  let leaving = false;
  const checkLeave = () => {
    const to = world.mode.leaveTo?.(world);
    if (!to || leaving || headless) return;
    leaving = true;
    const next = scenarioOfRoom(to);
    queueMicrotask(() => switchScenario(next));
  };
  /** Go to another scenario (the Esc menu). Only the court has a 3D scene: the others play on it as on a stand-in. */
  const switchScenario = (s: Scenario, checkpoint?: string, from?: PartyState) => {
    leaving = false;
    const party = s.kind === 'campaign' ? from ?? partyOf(world) : undefined;
    if (net?.state === 'playing') { net.switchRoom(s.room, checkpoint, party); return; }
    replaceWorld(world, worldFor(world, players, s.room as Room, checkpoint, party));
    scenario = s;
    saves.reset();
    net?.setRoom(s.room, checkpoint, party);
    recorder = new ReplayRecorder(7, MAX_SEATS);
    view.camera.reset();
    acc = 0;
    try { history.replaceState(null, '', location.pathname + location.search + hashFor(s, ally)); } catch { /* sandboxed */ }
  };

  const settings: Setting[] = [...volumeSettings(audio, setOpt)];
  const report = headless ? null : new ReportBox({
    where: () => ({ name: `${scenario.name} (3D)`, id: scenario.id }),
    checkpoint: () => world.mode.reached?.(world),
    rows: () => stats.info().rows,
    // the 3D canvas only (no panels): rendered and read in one task, so the drawing buffer is still there
    shot: async () => { view.render(); return new Promise<Blob | null>((ok) => view.canvas.toBlob(ok, 'image/png')); },
    onToggle: () => { keyboard.release(); pads.resync(); },
  });
  menu = new EscMenu({
    queued: () => world.seats.queueLen[net?.state === 'playing' ? net.seat : 0],
    net,
    scenario: () => scenario,
    switchScenario,
    settings,
    onToggle: (open) => { keyboard.release(); pads.resync(); audio?.director.ui(open ? 'open' : 'close'); },
    uiSound: (k) => audio?.director.ui(k),
    report: report ? () => { menu!.hide(); report.show(); } : undefined,
  });
  const menuAsk = opt('menu');
  const menuSection = MENU_SECTIONS.find((x) => x.toLowerCase() === (menuAsk ?? '').toLowerCase());
  if (menuAsk) menu.show(menuSection ?? 'Resume');

  const runStep = () => {
    const inputs = inputsFor();
    recorder.record(inputs);
    grantRunes();
    view.beforeStep(world);
    step(world, inputs);
    view.afterStep(world);
    stats.afterStep();
    tools.afterStep();
    if (!headless) saves.update(world.mode.reached?.(world), partyOf(world));
    checkLeave();
  };

  let acc = 0;
  let last = performance.now();
  const netSteps = (now: number) => {
    net!.pump(now);
    const s = net!.session;
    if (!s) return;
    const tick = () => {
      while (s.nextScheduled <= world.clock[0] + s.delay) s.pushLocal(keyboard.sample(world, net!.seat));
      return s.advance(1) > 0;
    };
    acc = Math.min(acc + (now - last) / 1000, 8 * DT);
    while (acc >= DT) {
      if (!tick()) break;
      acc -= DT;
    }
    for (let k = Math.min(6, s.lag - 2); k > 0; k--) if (!tick()) break;
  };
  // frame times, ms, for the shot script's perf note (window.__perf)
  const perf = { frame: [] as number[], render: [] as number[] };
  let frames = 0;
  // ?perf=1: 240 frames, so the perf note's times are past the first frames' shader compiles
  const SHOT_FRAMES = optOn('perf') ? 240 : 10;
  let lastFrame = performance.now();
  const frame = () => {
    const now = performance.now();
    lastFrame = now;
    menu!.frame(now);
    if (headless) { /* a shot: everyone stands still */ }
    else if (net?.state === 'playing') netSteps(now);
    else if (report?.open || menu!.pausing) { /* the world stands still */ }
    else if (tools.paused) for (let n = tools.takeSteps(); n > 0; n--) runStep();
    else {
      acc = Math.min(acc + ((now - last) / 1000) * tools.timeScale, 8 * DT);
      while (acc >= DT) { runStep(); acc -= DT; }
    }
    last = now;
    stats.frame(now);
    inspect.frame();
    try {
      view.draw(world, acc / DT, now);
      perf.frame.push(performance.now() - now); perf.render.push(view.renderMs);
      if (perf.frame.length > 600) { perf.frame.shift(); perf.render.shift(); }
      // a shot draws a few frames (the fading settles), then stops, so a slow software renderer leaves the page free to be read
      if (headless && ++frames >= SHOT_FRAMES) { (window as unknown as { __ready: boolean }).__ready = true; return; }
    } catch (err) {
      hud.style.display = '';
      hud.textContent = `draw error at tick ${world.clock[0]}: ${(err as Error).stack ?? err}`;
    }
    schedule(frame);
  };
  const chunks = (str: string): [string, string][] => str.split(/\s{2,}/).filter(Boolean).map((x) => {
    const k = x.indexOf(' ');
    return k < 0 ? [x, ''] : [x.slice(0, k), x.slice(k + 1)];
  });
  stats.info = () => ({
    rows: [
      ['tick', String(world.clock[0])], ['hash', hex(hashWorld(world))], ['renderer', 'three.js (3D)'],
      ['room', scenario.name], ...chunks(view.debug()), ...chunks(net?.flags() ?? ''),
    ],
    flags: tune.flags() + tools.flags(),
  });
  // headless shots run on timers (no animation frames in a hidden headless page)
  const schedule = headless || optOn('timerloop') ? (f: () => void) => setTimeout(f, 1000 / 60) : (f: () => void) => requestAnimationFrame(f);
  schedule(frame);
  const pump = () => {
    const now = performance.now();
    if (now - lastFrame < 120 || net?.state !== 'playing') return;
    netSteps(now);
    last = now;
  };
  try {
    const src = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16);'], { type: 'text/javascript' }));
    new Worker(src).onmessage = pump;
  } catch { window.setInterval(pump, 16); }

  (window as unknown as { __perf: unknown }).__perf = {
    get frame() { return perf.frame; }, get render() { return perf.render; },
    info: () => ({ ...view.info, programs: view.renderer.info.programs?.length ?? 0, geometries: view.renderer.info.memory.geometries, textures: view.renderer.info.memory.textures }),
    loadMs: view.kit.loadMs, loadBytes: view.kit.loadBytes, occluders: view.kit.occluders.length, faded: () => view.fader.count,
  };
  (window as unknown as { wizardSim: unknown }).wizardSim = {
    world, get recorder() { return recorder; }, tune, tools, stats, view, menu, audio, get net() { return net; }, perf, switchScenario, startWave: (n: number) => devStartWave(world, n, 1),
  };
}

boot().catch((err: Error) => {
  hud.style.display = '';
  hud.textContent = `boot error: ${err.stack ?? err}`;
  (window as unknown as { __error: string }).__error = String(err);
});
