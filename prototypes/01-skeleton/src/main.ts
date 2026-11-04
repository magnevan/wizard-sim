import { SIM_HZ } from './config';
import { Input } from './core/input';
import { FixedStep, FpsCounter } from './core/time';
import { BotController } from './game/bot';
import { KeyboardMouseController } from './game/controllers';
import { DemoController } from './game/demo';
import { Game } from './game/game';

const params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
// ?autoplay=1: a scripted Arena run (bot pilot + bot ally) for screenshots.
const autoplay = params.get('autoplay') === '1';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const input = new Input(canvas);
// ?rules=a1: start with rule set A.1 (F2 toggles A / A.1 at runtime).
const rules = params.get('rules') === 'a1' ? 'a1' : 'a';
const game = new Game(canvas, params.get('room') ?? (autoplay ? 'arena' : 'sanctum'), rules);

game.addPlayer(autoplay ? new BotController(null, 'Autoplay pilot') : demo ? new DemoController(rules) : new KeyboardMouseController(game.camera));
// More players: any gamepad button joins one (Game.pollGamepadJoin); K toggles an AI ally.
if (autoplay || params.get('ally') === '1') game.toggleBotAlly();
game.ui.help = !demo && !autoplay;
// ?wave=N: start the Arena at wave N (testing later waves).
const startWave = Number(params.get('wave'));
if (game.sim.world.encounter && startWave > 1) game.sim.world.encounter.wave = Math.floor(startWave);
game.ui.debug = params.get('debug') === '1';

const clock = new FixedStep(1 / SIM_HZ);
const fps = new FpsCounter();
let last = performance.now();

// Headless Chrome's --virtual-time-budget advances timers but not
// requestAnimationFrame, so demo mode drives the loop with setTimeout.
const schedule: (f: (now: number) => void) => void = demo || autoplay
  ? (f) => setTimeout(() => f(performance.now()), 1000 / 60)
  : (f) => requestAnimationFrame(f);

function frame(now: number): void {
  const n = clock.advance(now);
  for (let i = 0; i < n; i++) game.tick(input.consume(), clock.step);
  fps.frame(now);
  game.render(Math.min(0.1, (now - last) / 1000), fps.fps, clock.ticks);
  last = now;
  schedule(frame);
}
schedule(frame);
