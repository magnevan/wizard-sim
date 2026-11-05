// End-to-end co-op test in real Chrome: two pages host, join and start a match through the
// Co-op panel, both players act (keys and mouse), and the script checks they run the same match.
// Then: page A plays over a simulated slow link (the Network test), and page B reloads mid-match,
// is dropped, and rejoins its seat.
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
  for (const p of [a, b]) {
    await p.setViewport({ width: 640, height: 400 }); p.on('pageerror', (e) => console.error('page error:', e.message));
    // The longest the page's event loop went without running a timer (ms, since the last net() read): a
    // page that stalls past the game's 2.5 s silence limit is dropped by design, and this says so.
    await p.evaluateOnNewDocument(() => { const g = (window.__gap = { max: 0, last: performance.now() }); setInterval(() => { const n = performance.now(); g.max = Math.max(g.max, n - g.last); g.last = n; }, 50); });
  }
  await Promise.all([a.goto(url), b.goto(url)]);
  const net = (p) => p.evaluate(() => {
    const n = window.wizardSim?.net, s = n?.session, stall = Math.round(window.__gap?.max ?? 0);
    if (window.__gap) window.__gap.max = 0;
    return n && { state: n.state, seat: n.seat, players: n.players, rtt: Math.round(n.rtt), message: n.message, tick: s ? s.world.clock[0] : -1, gone: s ? [0, 1].map((p) => s.isGone(s.tick, p)) : [], lag: s ? s.lag : 0, desyncs: s ? s.desyncs.length : 0, waited: s ? s.waitedTicks : 0, replayed: s ? s.replayed : 0, status: n.bus?.status ?? '', stall };
  });
  // Click through the DOM, not the mouse: the panel re-renders every half second. Waits poll on a
  // timer: a headless page that is not in front never runs requestAnimationFrame, Puppeteer's default.
  const click = async (p, act) => {
    console.log('click', act);
    await p.waitForFunction((a) => !!document.querySelector(`#netplay [data-act="${a}"]`), { timeout: 20000, polling: 100 }, act)
      .catch(async (e) => { console.log('panel:', await p.evaluate(() => document.getElementById('netplay')?.outerHTML.slice(0, 300) ?? 'none')); throw e; });
    await p.evaluate((a) => document.querySelector(`#netplay [data-act="${a}"]`).click(), act);
  };
  const loaded = (p) => p.waitForFunction(() => !!window.wizardSim?.net, { timeout: 20000, polling: 100 });
  await Promise.all([loaded(a), loaded(b)]);

  console.log('pages loaded');
  // Open the panels, host, join.
  await click(a, 'toggle'); await click(b, 'toggle');
  let code = '';
  /** B enters the room code (WebRTC): it then joins, or rejoins, the host's match by itself. */
  const enterCode = async () => {
    await b.type('#rtc-code', code);
    await click(b, 'rtc-join');
  };
  if (webrtc) {
    await click(a, 'rtc-create');
    await a.waitForFunction(() => /^hosting /.test(window.wizardSim.net.bus.status), { timeout: 20000, polling: 100 });
    code = await a.evaluate(() => window.wizardSim.net.bus.code);
    console.log('room code', code);
    await enterCode();
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
  const fast = na.rtt;

  // 2. A slow link: page A pretends to be far away (the Network test section's values).
  await a.evaluate(() => { const l = window.wizardSim.net.link; l.lag = 150; l.jitter = 40; l.loss = 3; });
  await b.mouse.move(40, 200); await b.mouse.down();
  await sleep(4000);
  await b.mouse.up();
  await sleep(1500);
  const [sa, sb] = [await net(a), await net(b)];
  console.log('slow link: A', sa, 'B', sb);
  if (sa.rtt < 120) fail(`the simulated lag didn't show in the round trip (${sa.rtt} ms)`);
  if (sa.desyncs || sb.desyncs) fail('desync over the slow link');
  if (Math.abs(sa.tick - sb.tick) > 90) fail(`pages drifted apart over the slow link (${sa.tick} vs ${sb.tick}; A: "${sa.message}", B: "${sb.message}"; longest stall A ${sa.stall} ms, B ${sb.stall} ms)`);

  // 2b. Still on the slow link: how remote aim is guessed. B walks to a spot and back with the mouse
  // still (the cursor rests on the floor while the wizard moves), once per guess; A counts its rewinds.
  const rewinds = {};
  for (const mode of ['relative', 'world']) {
    // as the panel's switch does (a page whose session is gone fails below, not with a TypeError here)
    await Promise.all([a, b].map((p) => p.evaluate((m) => { const n = window.wizardSim.net; n.aimPrediction = m; if (n.session) n.session.aimPrediction = m; }, mode)));
    if ((await net(a)).tick < 0 || (await net(b)).tick < 0) throw new Error(`a page left the match on the slow link: A "${(await net(a)).message}", B "${(await net(b)).message}"`);
    const r0 = await a.evaluate(() => { const s = window.wizardSim.net.session; return { t: s.tick, replayed: s.replayed, checked: s.guesses.checked, wrong: s.guesses.wrong }; });
    for (const x of [600, 40]) { await b.mouse.move(x, 200); await b.mouse.down(); await sleep(2000); await b.mouse.up(); }
    await sleep(800);
    const r1 = await a.evaluate(() => { const s = window.wizardSim.net.session; return { t: s.tick, replayed: s.replayed, checked: s.guesses.checked, wrong: s.guesses.wrong }; });
    const secs = (r1.t - r0.t) / 60;
    rewinds[mode] = { perS: Math.round((r1.replayed - r0.replayed) / secs), wrongPct: Math.round(((r1.wrong - r0.wrong) * 100) / Math.max(1, r1.checked - r0.checked)) };
  }
  const [ca, cb] = [await net(a), await net(b)];
  console.log(`slow link, B walking with the mouse still: A rewound ${rewinds.relative.perS} ticks/s guessing aim as before (${rewinds.relative.wrongPct}% of guesses wrong), ${rewinds.world.perS} ticks/s in world space (${rewinds.world.wrongPct}% wrong)`);
  if (ca.desyncs || cb.desyncs) fail('desync while comparing aim guesses');
  await a.evaluate(() => { const l = window.wizardSim.net.link; l.lag = 0; l.jitter = 0; l.loss = 0; });

  // 3. B reloads mid-match: A drops it (the seat shows as gone), then B rejoins its seat.
  await b.reload();
  await loaded(b);
  await a.waitForFunction(() => { const s = window.wizardSim.net.session; return s.isGone(s.tick, 1); }, { timeout: 15000, polling: 100 });
  const ta = (await net(a)).tick;
  console.log('A dropped B at about tick', ta);
  await click(b, 'toggle');
  if (webrtc) await enterCode();
  else { await b.waitForFunction(() => /Rejoin/.test(document.querySelector('#netplay [data-act="join"]')?.textContent ?? ''), { timeout: 15000, polling: 100 }); await click(b, 'join'); }
  await b.waitForFunction(() => window.wizardSim.net.state === 'playing', { timeout: 20000, polling: 100 });
  const rb = await net(b);
  console.log('B rejoined:', rb);
  if (rb.seat !== 1) fail(`B came back in seat ${rb.seat + 1}, not 2`);
  await sleep(1500); // B catches up
  const rx0 = await a.evaluate(() => window.wizardSim.net.session.world.bodies.x[1]);
  await b.mouse.move(600, 200); await b.mouse.down();
  await sleep(2500);
  await b.mouse.up();
  await sleep(2000);
  const [ra, rb2] = [await net(a), await net(b)];
  const rx1 = await a.evaluate(() => window.wizardSim.net.session.world.bodies.x[1]);
  console.log('after rejoin: A', ra, 'B', rb2);
  if (ra.desyncs || rb2.desyncs) fail('desync after the rejoin');
  if (ra.gone[1]) fail('A still sees seat 2 as gone');
  if (Math.abs(ra.tick - rb2.tick) > 90) fail(`the rejoined page didn't catch up (${ra.tick} vs ${rb2.tick})`);
  if (!(Math.abs(rx1 - rx0) > 1)) fail(`A didn't see the rejoined wizard walk (x ${rx0.toFixed(2)} -> ${rx1.toFixed(2)})`);

  // 4. B's page hitches for 3.5 s (its loop and its messages both stall, as a frozen tab's would). A
  // rightly drops it; B, catching up, must see that the silence was its own and not drop A in turn
  // (it would be its own coordinator then, and its "drop" would kick the host out of the match).
  await b.evaluate(() => { const t = performance.now(); while (performance.now() - t < 3500); });
  await sleep(3000);
  const [ha, hb] = [await net(a), await net(b)];
  console.log('after B hitched: A', ha, 'B', hb);
  if (ha.state !== 'playing' || ha.tick < 0) fail(`the host left the match after B's hitch: "${ha.message}"`);
  if (ha.tick < ra.tick + 200) fail(`the host stalled after B's hitch (tick ${ra.tick} -> ${ha.tick})`);
  if (hb.state === 'playing' && !ha.gone[1]) console.log('(A kept B: the hitch was under the drop limit)');
  else if (hb.state === 'playing') fail('B still plays but A dropped it');
  if (!process.exitCode) console.log(`OK: ${webrtc ? 'WebRTC' : 'BroadcastChannel'} match ran in both pages (rtt ${fast} ms; ${sa.rtt} ms with the simulated link), B rejoined after a reload, and a hitch on B didn't drop the host`);
} catch (e) {
  fail(e.stack ?? e);
} finally {
  await browser.close();
  stop();
}
