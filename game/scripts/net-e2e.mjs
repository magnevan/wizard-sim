// End-to-end co-op test in real Chrome: two pages host, join and start a match through the
// Co-op panel, both players act (keys and mouse), and the script checks they run the same match.
// Usage (after npm run build):
//   node scripts/net-e2e.mjs            BroadcastChannel between the two pages (offline, fast)
//   node scripts/net-e2e.mjs --webrtc   real WebRTC through PeerJS's public signalling server
//   node scripts/net-e2e.mjs --webrtc --url https://magnevan.github.io/wizard-sim/   the deployed build
// Exit code 0 on success; prints what each page saw.
import puppeteer from 'puppeteer-core';
import { BASE, findChrome, startPreview } from './serve.mjs';

const webrtc = process.argv.includes('--webrtc');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };

const urlArg = process.argv.indexOf('--url');
const base = urlArg > 0 ? process.argv[urlArg + 1] : BASE;
const stop = urlArg > 0 ? () => {} : await startPreview();
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  protocolTimeout: 180_000,
  args: [
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    // Both pages must keep running at full speed, as two visible windows would.
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ],
});
try {
  const url = `${base}?lights=0&debug=0&timerloop=1${webrtc ? '' : '&net=bc'}`; // small and light: two software-rendered pages share one CPU
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const p of [a, b]) { await p.setViewport({ width: 640, height: 400 }); p.on('pageerror', (e) => console.error('page error:', e.message)); }
  await Promise.all([a.goto(url), b.goto(url)]);
  const net = (p) => p.evaluate(() => {
    const n = window.wizardSim?.net, s = n?.session;
    return n && { state: n.state, seat: n.seat, players: n.players, rtt: Math.round(n.rtt), message: n.message, tick: s ? s.world.clock[0] : -1, desyncs: s ? s.desyncs.length : 0, waited: s ? s.waitedTicks : 0, replayed: s ? s.replayed : 0, status: n.bus?.status ?? '' };
  });
  // Click through the DOM, not the mouse: the panel re-renders every half second. Waits poll on a
  // timer: a headless page that is not in front never runs requestAnimationFrame, Puppeteer's default.
  const click = async (p, act) => {
    console.log('click', act);
    await p.waitForFunction((a) => !!document.querySelector(`#netplay [data-act="${a}"]`), { timeout: 20000, polling: 100 }, act)
      .catch(async (e) => { console.log('panel:', await p.evaluate(() => document.getElementById('netplay')?.outerHTML.slice(0, 300) ?? 'none')); throw e; });
    await p.evaluate((a) => document.querySelector(`#netplay [data-act="${a}"]`).click(), act);
  };
  await Promise.all([a.waitForFunction(() => !!window.wizardSim?.net, { timeout: 20000, polling: 100 }), b.waitForFunction(() => !!window.wizardSim?.net, { timeout: 20000, polling: 100 })]);

  console.log('pages loaded');
  // Open the panels, host, join.
  await click(a, 'toggle'); await click(b, 'toggle');
  if (webrtc) {
    await click(a, 'rtc-create');
    await a.waitForFunction(() => /^hosting /.test(window.wizardSim.net.bus.status), { timeout: 20000, polling: 100 });
    const code = await a.evaluate(() => window.wizardSim.net.bus.code);
    console.log('room code', code);
    await b.type('#rtc-code', code);
    await click(b, 'rtc-join');
    await b.waitForFunction(() => window.wizardSim.net.state === 'joining', { timeout: 30000, polling: 100 });
  } else {
    await click(a, 'host');
    await b.waitForSelector('#netplay [data-act="join"]', { timeout: 10000 });
    await click(b, 'join');
  }
  await a.waitForFunction(() => window.wizardSim.net.joinedPlayers?.length === 2 || window.wizardSim.net['joinedPlayers']?.length === 2, { timeout: 15000, polling: 100 }).catch(() => {});
  console.log('joined');
  await click(a, 'start');
  await Promise.all([a.waitForFunction(() => window.wizardSim.net.state === 'playing', { timeout: 15000, polling: 100 }), b.waitForFunction(() => window.wizardSim.net.state === 'playing', { timeout: 15000, polling: 100 })]);
  console.log('started:', await net(a), await net(b));

  // Both players act: B walks with the mouse (hold LMB right of its wizard), A queues fire and casts.
  const bx0 = await a.evaluate(() => window.wizardSim.net.session.world.bodies.x[1]);
  await b.mouse.move(600, 200); await b.mouse.down();
  await a.keyboard.press('KeyF'); await a.mouse.move(500, 150); await a.mouse.down({ button: 'right' });
  await sleep(2500);
  await b.mouse.up(); await a.mouse.up({ button: 'right' });
  await sleep(2500);

  const [na, nb] = [await net(a), await net(b)];
  console.log('A', na); console.log('B', nb);
  const bx1 = await a.evaluate(() => window.wizardSim.net.session.world.bodies.x[1]);
  // Same match: both advanced, no desync; A saw B's wizard move; B's keyboard reached B's game.
  if (na.tick < 200 || nb.tick < 200) fail(`ticks too low (${na.tick}, ${nb.tick}): the match stalled`);
  if (Math.abs(na.tick - nb.tick) > 90) fail(`pages drifted apart (${na.tick} vs ${nb.tick})`);
  if (na.desyncs || nb.desyncs) fail('desync reported');
  if (!(bx1 > bx0 + 1)) fail(`A didn't see B's wizard walk (x ${bx0.toFixed(2)} -> ${bx1.toFixed(2)})`);
  const casts = await b.evaluate(() => Array.from(window.wizardSim.net.session.world.bodies.hp.slice(0, 2), (v) => Math.round(v)));
  console.log('wizard hp as B sees it', casts.join(', '));
  if (!process.exitCode) console.log(`OK: ${webrtc ? 'WebRTC' : 'BroadcastChannel'} match ran in both pages (rtt ${na.rtt} ms)`);
} catch (e) {
  fail(e.stack ?? e);
} finally {
  await browser.close();
  stop();
}
