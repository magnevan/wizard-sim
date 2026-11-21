/**
 * Boot and the fixed-step loop. The loop is the only place real time exists: it decides how
 * many 60 Hz sim steps to run this frame, feeds each one a recorded input, then draws once
 * with the leftover fraction as the interpolation alpha.
 *
 * URL options (?room=arena, ?autoplay=1, ...): every one is declared, with its help, in dev-options.ts,
 * and the Tune panel (F2) lists them under "URL options" as controls. Read them through opt() /
 * optOn() / optNum() from there, never from location.search.
 *
 * Scenarios (rooms) are listed in scenarios.ts: the number keys and the Esc menu (menu.ts) switch
 * between them in place, without a reload, so an open online lobby survives the switch.
 */
import { Application } from 'pixi.js';
import { TextureSource } from 'pixi.js';
import {
  DT, MAX_SEATS, NO_INPUT, ReplayRecorder, botInput, partyOf, createWorld, devStartWave, hashWorld, hex, newBotMemory, newTutorialBot, replaceWorld, runReplay, scriptedInput, scriptedReplay, step, tutorialBotInput,
  type PartyState, type PlayerInput, type Room, type World,
} from '@wizard-sim/sim';
import { demoInput, enemyAttackScene, parseDemo, rallyScene, threeScene } from './demo';
import { PadSeats } from './gamepad';
import { SaveWatch } from './saves';
import { KeyboardMouse } from './input';
import { TunePanel } from './tune-panel';
import { ToolsPanel } from './tools-panel';
import { StatsPanel } from './stats-panel';
import { Inspect } from './inspect';
import { HelpPanel } from './help-panel';
import { loadSaved } from './tune-io';
import { WorldView } from './view';
import { PROP_SETS } from './art/assets';
import { newRigState, paint } from './art/rigs';
import * as px from './art/px';
import { broadcastBus, roomBus } from './net/bus';
import { webrtcBus } from './net/webrtc';
import { NetPlay } from './net/netplay';
import { EscMenu, type Setting } from './menu';
import { ReportBox } from './report';
import { GameAudio, loadVolumes, volumeSettings } from './audio/game-audio';
import { MENU_SECTIONS, onOption, opt, optNum, optOn, seedOpt, setOpt } from './dev-options';
import { fromLocation, hashFor, scenarioById, scenarioForKey, scenarioOfRoom, worldFor, type Scenario } from './scenarios';

// Artifact links carry no query string, only a plain #anchor: #arena, #ally or #arena-ally work there too.
const start = fromLocation(location.search, location.hash);
if (start.ally) seedOpt('ally', '1');
// #tutorial-7 (or ?beat=7): the tutorial starting at beat 7
for (const tok of location.hash.slice(1).split('-')) if (/^\d+$/.test(tok)) seedOpt('beat', tok);
const hud = document.getElementById('hud')!;

if (optOn('selftest')) selftest();
else void boot();

/** Runs the golden replay with no rendering, for scripts/browser-check.mjs. */
function selftest(): void {
  const ticks = Number(opt('ticks') ?? 1800);
  const r = runReplay(scriptedReplay(ticks));
  document.documentElement.dataset.hash = hex(r.hash);
  document.documentElement.dataset.trail = r.trail.map(hex).join(',');
  hud.textContent = `selftest ${ticks} ticks: ${hex(r.hash)}`;
}

async function boot(): Promise<void> {
  const scripted = optOn('script');
  const autoplay = optOn('autoplay');
  const demo = [parseDemo(opt('spell')), parseDemo(opt('spell2') ?? opt('spell'))];
  const headless = scripted || autoplay || !!demo[0];
  // ?autoplay=1: bots fight the Arena, or play the tutorial through when it was asked for
  let scenario: Scenario = autoplay && start.scenario.id !== 'tutorial' && start.scenario.id !== 'academy' ? scenarioById('arena')! : start.scenario;
  const room = scenario.room as Room;
  TextureSource.defaultOptions.scaleMode = 'nearest';
  // Headless runs seat two wizards. Interactive play starts with you alone; gamepads join seats 1-3
  // with any button, and ?ally=1 puts a bot wizard on seat 1 (a dev ally for trying co-op solo).
  const ally = optOn('ally');
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
    preserveDrawingBuffer: headless && !optOn('rafloop'),
    preference: opt('renderer') === 'webgpu' ? 'webgpu' : 'webgl',
  });
  app.ticker.stop();
  host.appendChild(app.canvas);

  // #hud only shows a draw error now; the game's numbers are in the Stats panel (F4)
  hud.style.display = 'none';
  const view = new WorldView();
  view.setRenderer(app.renderer);
  // The live view options (dev-options.ts): applied now, and again whenever the Esc menu, a key or the Tune panel sets one.
  // The art test's props and wizard are client only: each player picks their own.
  const viewOptions = () => {
    view.lightsOn = optOn('lights');
    view.mood = opt('mood');
    view.props.set = PROP_SETS.find((s) => s === opt('props')) ?? 'lean';
    view.wizardHd = opt('wizard') === 'hd';
  };
  viewOptions();
  for (const k of ['lights', 'mood', 'props', 'wizard'] as const) onOption(k, viewOptions);
  // ?ally=1's bot stands in for a partner on another screen: the camera doesn't follow it
  if (ally && !headless) view.isLocal = (s) => s !== 1;
  // tests and screenshots: ?local=0 frames seat 0 only (the others get edge arrows)
  const onlySeat = opt('local');
  if (onlySeat !== null && onlySeat !== '') { const k = Number(onlySeat); view.isLocal = (s) => s === k; }
  app.stage.addChild(view.root);
  // Sound is prepared after boot and starts on the first input, as browsers ask; ?sound=0 leaves it out (audio/game-audio.ts).
  const audio = !optOn('sound') ? null : new GameAudio(loadVolumes(), !headless);
  view.sound = audio?.director ?? null;
  // ?lab on the dev server: the Sound Lab, one page with a tab per element and one for music and ambience. The check goes first so a build drops the whole file.
  let lab: { input(w: World): PlayerInput | null } | null = null;
  // ?lab=atmos: the Atmosphere Lab (music and ambience per room); without it, each room plays the beds marked Right there
  if (import.meta.env.DEV && audio && opt('lab') === 'atmos') void import('./audio/atmos').then((m) => { lab = new m.AtmosLab(audio); });
  // ?lab on its own opens the first lab with takes still to review; its tabs reach the rest
  else if (import.meta.env.DEV && audio && opt('lab') !== null) void import('./audio/lab').then((m) => { lab = new m.SoundLab(audio, opt('lab') ?? ''); });
  else if (import.meta.env.DEV && audio && optOn('baseline')) {
    void import('./audio/baseline').then((m) => m.loadBaseline(audio));
    void import('./audio/atmos').then((m) => m.roomBeds(audio, () => world.def.id));
  }
  const fit = () => view.resize(host.clientWidth, host.clientHeight, optNum('scale') || undefined);
  fit();
  addEventListener('resize', fit);
  onOption('scale', fit);

  // the saved tuning goes in before the world exists, so spawn-time numbers (hp, radii) use it too
  loadSaved();
  // ?at=<checkpoint> starts a chapter part-way (the battery: well-failing, repair); ?fail=1 and ?fail=2 are the old names
  const failAlias: Record<string, string> = { 1: 'well-failing', 2: 'repair' };
  const startAt = opt('at') ?? failAlias[opt('fail') ?? ''] ?? undefined;
  const world = createWorld(7, players, { room, tutorialBeat: optNum('beat') || undefined, checkpoint: startAt });
  // the campaign save: the last checkpoint passed in a chapter, written as you pass it (saves.ts)
  const saves = new SaveWatch(() => scenario);
  // the tutorial's end card: walking into an arch switches rooms, as the 1 / 2 / 3 keys do
  if (!headless) view.tut.onExit = (to) => { const s = scenarioById(to); if (s) switchScenario(s); };
  // ?scene=rally / ?scene=three (Survive, headless): a rally in progress, or +1 to three being chosen, for screenshots (demo.ts)
  const sceneName = headless && world.run ? opt('scene') : null;
  const scene = sceneName === 'rally' || sceneName === 'three';
  if (sceneName === 'rally') rallyScene(world);
  if (sceneName === 'three') threeScene(world);
  // ?scene=enemyattacks (headless, any room): the sim never steps; each frame poses every enemy at one beat of its attack
  const atkScene = headless && opt('scene') === 'enemyattacks';
  const atkPhase = opt('phase') ?? 'wind', atkFace = Number(opt('face') ?? 0.06);
  const bots = [newBotMemory(), newBotMemory()];
  const tutBots = [newTutorialBot(), newTutorialBot()];
  const pads = new PadSeats();
  const keyboard = new KeyboardMouse(app.canvas, view.camera);
  let recorder = new ReplayRecorder(7, MAX_SEATS);
  const tune = new TunePanel(optOn('tune'));
  const tools = new ToolsPanel(world, view.camera, app.canvas, optOn('tools'), optOn('stage'));
  const stats = new StatsPanel(world, optOn('stats'));
  const inspect = new Inspect(world, view.camera);
  const help = new HelpPanel(world, view, headless ? null : pads, { headless, open: optOn('help'), force: opt('helpq'), hint: optOn('helphint'), stats: optOn('helpstats') });
  app.stage.addChild(help.root);

  const inputsFor = (tick: number): PlayerInput[] => {
    const out: PlayerInput[] = [];
    if (headless) {
      for (let p = 0; p < MAX_SEATS; p++) out.push(p >= players || scene ? NO_INPUT : autoplay ? (world.tut ? tutorialBotInput(world, p, tutBots[p]) : botInput(world, p, bots[p])) : demo[0] ? (demo[p] ? demoInput(world, tick, p, demo[p]!) : NO_INPUT) : scriptedInput(tick, p));
      return out;
    }
    pads.poll((seat) => world.seats.active[seat] === 1 || (ally && seat === 1));
    for (let p = 0; p < MAX_SEATS; p++) {
      if (p === 0) out.push(lab?.input(world) ?? keyboard.sample(world, 0));
      else if (ally && p === 1) out.push(botInput(world, 1, bots[1]));
      else out.push(pads.sample(p) ?? NO_INPUT);
    }
    return out;
  };

  // Online co-op: the artifact's room on claude.ai, or other tabs with ?net=bc. Nothing headless.
  let net: NetPlay | null = null;
  let menu: EscMenu | null = null;
  if (!headless) {
    // On claude.ai: the artifact's room. Elsewhere (the dev server, a hosted page): WebRTC, or tabs with ?net=bc.
    const bus = opt('net') === 'bc' ? broadcastBus() : (await roomBus()) ?? webrtcBus();
    if (bus) net = new NetPlay(bus, world, room, () => {
      acc = 0;
      menu?.hide(); // the match begins (or moved): back to the game
      scenario = scenarioOfRoom(net!.roomName);
      saves.reset();
      view.tut.restart();
      // While rollback replays ticks it already showed, skip effects and meters (they'd play twice);
      // the view only notes remote spells the replay started, to show them from their first frame.
      const s = net!.session!;
      view.setLocalSeat(net!.seat);
      s.hooks = {
        before: (w) => { net!.beforeTick(w.clock[0]); view.beforeStep(w); }, after: (w) => { if (!s.replaying) { view.afterStep(w); stats.afterStep(); tools.afterStep(); help.afterStep(w); saves.update(w.mode.reached?.(w), partyOf(w)); checkLeave(); } else view.replayStep(w); },
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

  /**
   * Go to another scenario. Alone (or in a lobby that hasn't started) the world is rebuilt in place,
   * keeping everyone who is seated; in a match only the host can, and everyone follows (netplay.ts).
   */
  /** A campaign area the party walks out of (Mode.leaveTo: the yard's gate) hands over to the next, once. */
  let leaving = false;
  const checkLeave = () => {
    const to = world.mode.leaveTo?.(world);
    if (!to || leaving || headless) return;
    leaving = true;
    const next = scenarioOfRoom(to);
    queueMicrotask(() => switchScenario(next));
  };
  const switchScenario = (s: Scenario, checkpoint?: string, from?: PartyState) => {
    leaving = false;
    // a campaign area starts with what the party has: handed over (Continue: the save's), or from the area it leaves
    const party = s.kind === 'campaign' ? from ?? partyOf(world) : undefined;
    if (net?.state === 'playing') { net.switchRoom(s.room, checkpoint, party); return; }
    replaceWorld(world, worldFor(world, players, s.room as Room, checkpoint, party));
    view.tut.restart(); // the same tutorial again greets its first beat again
    scenario = s;
    saves.reset();
    net?.setRoom(s.room, checkpoint, party);
    recorder = new ReplayRecorder(7, MAX_SEATS);
    acc = 0;
    try { history.replaceState(null, '', location.pathname + location.search + hashFor(s, ally)); } catch { /* sandboxed */ }
  };
  // The number keys switch scenarios (each scenario's `key` in scenarios.ts: 1 Sanctum, 2 Arena, 3 Survive, ...).
  // Not in an online match: one stray key would move everyone; the host uses the menu there.
  addEventListener('keydown', (e) => {
    const s = scenarioForKey(e.code);
    if (s && !e.repeat && net?.state !== 'playing') switchScenario(s);
  });

  // O and I, in the Academy only: nothing a player can hit by accident elsewhere.
  addEventListener('keydown', (e) => {
    if (e.repeat || scenario.id !== 'academy' || menu?.open) return;
    if (e.code === 'KeyO') { const s = PROP_SETS[(PROP_SETS.indexOf(view.props.set) + 1) % PROP_SETS.length]; view.props.set = s; setOpt('props', s === 'lean' ? null : s); }
    if (e.code === 'KeyI') { setOpt('wizard', view.wizardHd ? null : 'hd'); }
  });

  const scaleSteps = [0, 1, 2, 3, 4];
  const settings: Setting[] = [
    {
      label: 'Pixel scale', blurb: 'How big each art pixel is on screen. Auto fits about 270 art pixels of height.',
      value: () => (optNum('scale') ? `${optNum('scale')}x` : 'AUTO'),
      adjust: (by) => {
        const i = Math.max(0, scaleSteps.indexOf(optNum('scale')));
        const next = scaleSteps[(i + by + scaleSteps.length) % scaleSteps.length];
        setOpt('scale', next ? String(next) : null);
      },
    },
    {
      label: 'Lights', blurb: 'The glow of spells and fire. Off is lighter on slow machines.',
      value: () => (view.lightsOn ? 'ON' : 'OFF'),
      adjust: () => setOpt('lights', view.lightsOn ? '0' : null),
    },
    ...volumeSettings(audio, setOpt),
  ];
  // F8: file an issue from the game (report.ts); made before the menu so its keys come first
  const report = headless ? null : new ReportBox({
    where: () => ({ name: scenario.name, id: scenario.id }),
    checkpoint: () => world.mode.reached?.(world),
    rows: () => stats.info().rows,
    shot: async () => {
      const c = app.renderer.extract.canvas({ target: app.stage }) as HTMLCanvasElement;
      return new Promise<Blob | null>((ok) => (c.toBlob ? c.toBlob(ok, 'image/png') : ok(null)));
    },
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
  help.padsBlocked = () => menu!.open; // the D-pad moves the menu while it's open
  const menuAsk = opt('menu'), menuAt = optNum('menuAt');
  const menuSection = MENU_SECTIONS.find((x) => x.toLowerCase() === (menuAsk ?? '').toLowerCase());
  if (menuAsk && !menuAt) menu.show(menuSection ?? 'Resume');

  const runStep = () => {
    const inputs = inputsFor(world.clock[0]);
    recorder.record(inputs);
    view.beforeStep(world);
    step(world, inputs);
    view.afterStep(world);
    stats.afterStep();
    tools.afterStep();
    help.afterStep(world);
    if (!headless) saves.update(world.mode.reached?.(world), partyOf(world));
    checkLeave();
    stepsRun++;
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
  const pauseAt = optNum('pauseAt');
  // ?perf=1: per-frame timings (ms) for scripts/perf.mjs; steps = sim steps run that frame
  const perf = optOn('perf') ? { sim: [] as number[], steps: [] as number[], help: [] as number[], draw: [] as number[], render: [] as number[], frame: [] as number[] } : null;
  let stepsRun = 0;
  let lastFrame = performance.now();
  const frame = () => {
    const now = performance.now();
    lastFrame = now;
    stepsRun = 0;
    if (pauseAt && world.clock[0] >= pauseAt && !tools.paused) tools.paused = true;
    if (menuAsk && menuAt && world.clock[0] >= menuAt && !menu!.open) menu!.show(menuSection ?? 'Resume');
    menu!.frame(now);
    if (atkScene) { enemyAttackScene(world, atkPhase, atkFace, now); view.beforeStep(world); }
    else if (net?.state === 'playing') netSteps(now);
    else if (report?.open) { /* filing a report: the world stands still */ }
    else if (menu!.pausing) { /* the menu is open: the world stands still */ }
    else if (tools.paused) for (let n = tools.takeSteps(); n > 0; n--) runStep();
    else {
      acc = Math.min(acc + ((now - last) / 1000) * tools.timeScale, 8 * DT);
      while (acc >= DT) { runStep(); acc -= DT; }
    }
    last = now;
    stats.frame(now);
    inspect.frame();
    try {
      const t1 = performance.now();
      help.frame(now);
      const t2 = performance.now();
      view.draw(world, acc / DT, now);
      const t3 = performance.now();
      app.render();
      if (perf) {
        const t4 = performance.now();
        perf.sim.push(t1 - now); perf.steps.push(stepsRun); perf.help.push(t2 - t1); perf.draw.push(t3 - t2); perf.render.push(t4 - t3); perf.frame.push(t4 - now);
      }
    } catch (err) {
      // keep the loop alive and say what broke (a frozen frame is much harder to debug)
      hud.style.display = '';
      hud.textContent = `draw error at tick ${world.clock[0]}: ${(err as Error).stack ?? err}`;
      schedule(frame);
      return;
    }
    schedule(frame);
  };
  // the Stats panel's Game section: what the old debug line in the corner said
  const chunks = (str: string): [string, string][] => str.split(/\s{2,}/).filter(Boolean).map((x) => {
    const k = x.indexOf(' ');
    return k < 0 ? [x, ''] : [x.slice(0, k), x.slice(k + 1)];
  });
  const mode = autoplay ? 'autoplay' : demo[0] ? 'spell demo' : scripted ? 'scripted run' : '';
  stats.info = () => ({
    rows: [
      ['tick', String(world.clock[0])], ['hash', hex(hashWorld(world))], ['scale', `${view.camera.scale}×`], ['renderer', app.renderer.name],
      ['room', scenario.name], ...(mode ? [['mode', mode] as [string, string]] : []),
      ...chunks(view.debug()), ...chunks(net?.flags() ?? ''),
    ],
    flags: tune.flags() + tools.flags(),
  });
  // ?timerloop=1: timers instead of animation frames, so a background tab keeps running (the co-op e2e test).
  const schedule = (headless || optOn('timerloop')) && !optOn('rafloop') ? (f: () => void) => setTimeout(f, 1000 / 60) : (f: () => void) => requestAnimationFrame(f);
  schedule(frame);
  // A co-op match must go on in a page that gets no animation frames (a hidden tab, a window covered by another, a
  // minimised one): otherwise it stops stepping and sending, and the others drop it the moment anyone acts. While frames
  // have stopped, a worker's timer (not throttled the way a hidden page's own timers are) runs the net and the sim,
  // without drawing; the next frame takes over again.
  const pump = () => {
    const now = performance.now();
    if (now - lastFrame < 120 || net?.state !== 'playing' || atkScene) return;
    netSteps(now);
    last = now;
  };
  try {
    const src = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16);'], { type: 'text/javascript' }));
    new Worker(src).onmessage = pump;
  } catch { window.setInterval(pump, 16); } // no workers here (a locked-down page): plain timers, throttled but better than none

  // Expose the recorder for debugging: copy a replay of this session from the console.
  (window as unknown as { wizardSim: unknown }).wizardSim = {
    world, get recorder() { return recorder; }, tune, tools, stats, view, menu, help, audio, get net() { return net; },
    app, perf, switchScenario, startWave: (n: number) => devStartWave(world, n, 1), art: { newRigState, paint, px },
  };
}
