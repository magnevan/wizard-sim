import { describe, expect, it, vi } from 'vitest';
import { BTN, NO_INPUT, createWorld, hashWorld, partyOf, quantize } from '@wizard-sim/sim';
import { subscribe, type Bus } from '../src/net/bus';

// A minimal DOM for the Co-op panel (it only needs elements to write into).
const el = () => ({ style: {} as Record<string, string>, dataset: {} as Record<string, string>, innerHTML: '', addEventListener: () => {}, id: '' });
vi.stubGlobal('document', { createElement: el, body: { appendChild: () => {} } });
vi.stubGlobal('window', { setInterval: () => 0, addEventListener: () => {} });

/** An in-memory bus: every page hears every other page's messages, in order, at once. */
function hub() {
  const pages: { self: string; handlers: Map<string, ((d: unknown, f: string) => void)[]> }[] = [];
  return (self: string): Bus => {
    const me = { self, handlers: new Map<string, ((d: unknown, f: string) => void)[]>() };
    pages.push(me);
    return {
      kind: 'broadcast', self,
      emit: (topic, data) => { for (const p of pages) if (p !== me) for (const fn of p.handlers.get(topic) ?? []) fn(JSON.parse(JSON.stringify(data)), self); },
      on: (topic, fn) => subscribe(me.handlers, topic, fn),
    };
  };
}

describe('online co-op over the bus', () => {
  it('host, join, start: both pages run the same world', async () => {
    vi.useFakeTimers();
    const { NetPlay } = await import('../src/net/netplay');
    const bus = hub();
    const wa = createWorld(1, 1), wb = createWorld(2, 1);
    const a = new NetPlay(bus('aaaa'), wa, 'arena', () => {});
    const b = new NetPlay(bus('bbbb'), wb, 'arena', () => {});
    a.host();
    vi.advanceTimersByTime(1600);
    b.join([...(b as unknown as { open: Map<string, unknown> }).open.keys()][0]);
    a.start();
    vi.advanceTimersByTime(1500);
    expect(a.state).toBe('playing');
    expect(b.state).toBe('playing');
    expect([a.seat, b.seat]).toEqual([0, 1]);
    expect(hashWorld(wa)).toBe(hashWorld(wb)); // both started from the same seed and room

    // Play 300 ticks; each page only knows its own input.
    let now = 0;
    for (let f = 0; f < 900 && (wa.clock[0] < 300 || wb.clock[0] < 300); f++) {
      now += 17;
      for (const [p, w] of [[a, wa], [b, wb]] as const) {
        p.pump(now);
        const s = p.session!;
        if (w.clock[0] < 300 && s.nextScheduled <= w.clock[0] + s.delay) {
          s.pushLocal(quantize({ ...NO_INPUT, moveX: p.seat ? -60 : 60, buttons: f % 90 < 3 ? BTN.force : 0, press0: f % 90 === 50 ? 8 : 0, aimX: 64, aimY: 0 }));
        }
        if (w.clock[0] < 300) s.advance(1);
      }
    }
    expect([wa.clock[0], wb.clock[0]]).toEqual([300, 300]);
    expect(hashWorld(wa)).toBe(hashWorld(wb));
    expect(a.session!.desyncs).toEqual([]);
    vi.useRealTimers();
  });

  it('a player leaves, the others carry on, and a new page takes the seat back', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { NetPlay } = await import('../src/net/netplay');
    type Page = InstanceType<typeof NetPlay>;
    const bus = hub();
    const worlds = [createWorld(1, 1), createWorld(2, 1), createWorld(3, 1)];
    const [a, b, c] = ['aaaa', 'bbbb', 'cccc'].map((id, i) => new NetPlay(bus(id), worlds[i], 'arena', () => {}));
    a.host();
    vi.advanceTimersByTime(1600);
    const match = [...(b as unknown as { open: Map<string, unknown> }).open.keys()][0];
    b.join(match); c.join(match);
    a.start();
    vi.advanceTimersByTime(1500);
    expect([a.state, b.state, c.state]).toEqual(['playing', 'playing', 'playing']);

    let now = 0, f = 0;
    const play = (pages: [Page, ReturnType<typeof createWorld>][], until: number) => {
      for (let n = 0; n < until * 3 && pages.some(([, w]) => w.clock[0] < until); n++, f++) {
        now += 17;
        for (const [p, w] of pages) {
          p.pump(now);
          const s = p.session;
          if (!s) continue;
          for (let r = 1 + Math.max(0, Math.min(6, s.lag - 2)); r > 0 && w.clock[0] < until; r--) {
            while (s.nextScheduled <= w.clock[0] + s.delay) s.pushLocal(quantize({ ...NO_INPUT, moveX: [60, -60, 30][p.seat], buttons: f % 90 < 3 ? BTN.force : 0, press0: f % 90 === 50 ? 8 : 0, aimX: 64, aimY: 0 }));
            s.advance(1);
          }
        }
        vi.advanceTimersByTime(17);
      }
    };
    play([[a, worlds[0]], [b, worlds[1]], [c, worlds[2]]], 200);
    c.leave(); // says bye: the others agree on the drop at once
    play([[a, worlds[0]], [b, worlds[1]]], 400);
    expect([worlds[0].clock[0], worlds[1].clock[0]]).toEqual([400, 400]);
    expect(a.session!.isGone(399, 2) && b.session!.isGone(399, 2)).toBe(true);
    expect(hashWorld(worlds[0])).toBe(hashWorld(worlds[1]));

    // A new page sees the empty seat in the lobby (the coordinator announces it) and takes it.
    const wd = createWorld(9, 1);
    const d = new NetPlay(bus('dddd'), wd, 'arena', () => {});
    play([[a, worlds[0]], [b, worlds[1]]], 500);
    expect((d as unknown as { open: Map<string, { rejoin?: boolean }> }).open.get(match)?.rejoin).toBe(true);
    d.join(match);
    await vi.waitFor(() => expect(d.state).toBe('playing'), { timeout: 5000 });
    expect(d.seat).toBe(2);
    play([[a, worlds[0]], [b, worlds[1]], [d, wd]], 800);
    expect([worlds[0].clock[0], worlds[1].clock[0], wd.clock[0]]).toEqual([800, 800, 800]);
    expect(hashWorld(wd)).toBe(hashWorld(worlds[0]));
    expect(hashWorld(worlds[1])).toBe(hashWorld(worlds[0]));
    expect([a, b, d].every((p) => p.session!.desyncs.length === 0)).toBe(true);
    vi.useRealTimers();
  });

  it('a joiner takes the host tuning, and the host can retune mid-match without a desync', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { NetPlay } = await import('../src/net/netplay');
    const { findTunable, resetTuning, overrides, applyOverrides } = await import('@wizard-sim/sim');
    const bus = hub();
    const wa = createWorld(1, 1), wb = createWorld(2, 1);
    const a = new NetPlay(bus('h'), wa, 'arena', () => {});
    const b = new NetPlay(bus('j'), wb, 'arena', () => {});
    // Two pages in one process share the tuning tables, so each page's tuning is swapped in around its own steps.
    const own = new Map<unknown, Record<string, number>>();
    const swap = (p: unknown) => { resetTuning(); applyOverrides(own.get(p) ?? {}); };
    const keep = (p: unknown) => own.set(p, overrides());
    findTunable('runes.regen')!.set(0.9); keep(a);
    a.host();
    vi.advanceTimersByTime(1600);
    resetTuning(); keep(b);
    swap(b); b.join([...(b as unknown as { open: Map<string, unknown> }).open.keys()][0]);
    expect(b.state).toBe('joining'); // a different tuning no longer refuses the join
    swap(a); a.start(); keep(a);
    vi.advanceTimersByTime(1500); keep(b);
    expect(own.get(b)!['runes.regen']).toBe(0.9); // the joiner took the host tuning
    for (const p of [a, b]) p.session!.hooks = { before: (w) => p.beforeTick(w.clock[0]) }; // as main.ts does
    let now = 0;
    for (let f = 0; f < 600 && (wa.clock[0] < 400 || wb.clock[0] < 400); f++) {
      now += 17;
      for (const [p, w] of [[a, wa], [b, wb]] as const) {
        swap(p);
        p.pump(now);
        const s = p.session!;
        if (w.clock[0] < 400) {
          if (s.nextScheduled <= w.clock[0] + s.delay) s.pushLocal(quantize({ ...NO_INPUT, moveX: p.seat ? -60 : 60, buttons: f % 60 < 3 ? BTN.force : 0, press0: f % 60 === 30 ? 8 : 0, aimX: 64, aimY: 0 }));
          s.advance(1);
        }
        if (p === a && f === 120) p.proposeTuning({ 'runes.regen': 0.4, 'body.walkSpeed': 6 }); // the host retunes
        keep(p);
      }
      vi.advanceTimersByTime(17);
    }
    expect([wa.clock[0], wb.clock[0]]).toEqual([400, 400]);
    expect(own.get(b)!['body.walkSpeed']).toBe(6);
    expect(hashWorld(wa)).toBe(hashWorld(wb));
    expect(a.session!.desyncs).toEqual([]);
    expect(b.canTune).toBe(false);
    resetTuning();
    vi.useRealTimers();
  });
  it('the host moves the match to another scenario and everyone follows', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { NetPlay } = await import('../src/net/netplay');
    type Page = InstanceType<typeof NetPlay>;
    const bus = hub();
    const wa = createWorld(1, 1), wb = createWorld(2, 1);
    const a = new NetPlay(bus('hh'), wa, 'arena', () => {});
    const b = new NetPlay(bus('jj'), wb, 'sanctum', () => {});
    a.host();
    vi.advanceTimersByTime(1600);
    b.join([...(b as unknown as { open: Map<string, unknown> }).open.keys()][0]);
    a.start();
    vi.advanceTimersByTime(1500);
    expect(b.roomName).toBe('arena');
    expect(a.isHost && !b.isHost).toBe(true);
    let now = 0, f = 0;
    const play = (pages: [Page, ReturnType<typeof createWorld>][], until: number) => {
      for (let n = 0; n < until * 3 && pages.some(([, w]) => w.clock[0] < until); n++, f++) {
        now += 17;
        for (const [p, w] of pages) {
          p.pump(now);
          const s = p.session!;
          if (w.clock[0] >= until) continue;
          while (s.nextScheduled <= w.clock[0] + s.delay) s.pushLocal(quantize({ ...NO_INPUT, moveX: p.seat ? -60 : 60, buttons: f % 90 < 3 ? BTN.force : 0, press0: f % 90 === 50 ? 8 : 0, aimX: 64, aimY: 0 }));
          s.advance(1);
        }
        vi.advanceTimersByTime(17);
      }
    };
    play([[a, wa], [b, wb]], 150);
    const old = a.match;
    expect(b.switchRoom('survive')).toBe(false); // only the host
    expect(a.switchRoom('survive')).toBe(true);
    vi.advanceTimersByTime(50);
    expect(b.state).toBe('playing');
    expect(b.match).toBe(a.match);
    expect(a.match).not.toBe(old);
    expect(b.roomName).toBe('survive');
    expect(wa.run && wb.run).toBeTruthy(); // both are Survive worlds now
    expect([wa.clock[0], wb.clock[0]]).toEqual([0, 0]);
    play([[a, wa], [b, wb]], 300);
    expect([wa.clock[0], wb.clock[0]]).toEqual([300, 300]);
    expect(hashWorld(wa)).toBe(hashWorld(wb));
    expect(a.session!.desyncs.length + b.session!.desyncs.length).toBe(0);
    // the chapter jump: the host puts everyone into the battery at its repair, and both pages build that place
    expect(a.switchRoom('battery', 'repair', { v: 1, pools: { fire: 1, water: 2 } })).toBe(true); // Water: only the party handed over has it
    vi.advanceTimersByTime(50);
    expect(b.roomName).toBe('battery');
    expect(b.checkpointName).toBe('repair');
    expect([wa.mode.reached?.(wa), wb.mode.reached?.(wb)]).toEqual(['repair', 'repair']);
    expect([partyOf(wa), partyOf(wb)]).toEqual([{ v: 1, pools: { water: 2, fire: 1 } }, { v: 1, pools: { water: 2, fire: 1 } }]);
    play([[a, wa], [b, wb]], 120);
    expect(hashWorld(wa)).toBe(hashWorld(wb));
    expect(a.session!.desyncs.length + b.session!.desyncs.length).toBe(0);
    vi.useRealTimers();
  });

  it('a page that left stops queuing its old match\'s packets, and Leave during a rejoin stays left', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const { NetPlay } = await import('../src/net/netplay');
    type Page = InstanceType<typeof NetPlay>;
    const bus = hub();
    const worlds = [createWorld(1, 1), createWorld(2, 1), createWorld(3, 1)];
    const [a, b, c] = ['ka', 'kb', 'kc'].map((id, i) => new NetPlay(bus(id), worlds[i], 'arena', () => {}));
    a.host();
    vi.advanceTimersByTime(1600);
    const match = [...(b as unknown as { open: Map<string, unknown> }).open.keys()][0];
    b.join(match); c.join(match);
    a.start();
    vi.advanceTimersByTime(1500);
    let now = 0;
    const play = (pages: [Page, ReturnType<typeof createWorld>][], until: number) => {
      for (let n = 0; n < until * 3 && pages.some(([, w]) => w.clock[0] < until); n++) {
        now += 17;
        for (const [p, w] of pages) {
          p.pump(now);
          const s = p.session;
          if (!s || w.clock[0] >= until) continue;
          while (s.nextScheduled <= w.clock[0] + s.delay) s.pushLocal(quantize({ ...NO_INPUT, moveX: p.seat ? -60 : 60, aimX: 64, aimY: 0 }));
          s.advance(1);
        }
        vi.advanceTimersByTime(17);
      }
    };
    const ab: [Page, ReturnType<typeof createWorld>][] = [[a, worlds[0]], [b, worlds[1]]];
    play([...ab, [c, worlds[2]]], 100);
    const old = (c as unknown as { transport: { receive(): unknown[] } }).transport;
    c.leave();
    old.receive();
    play(ab, 300);
    expect(old.receive()).toEqual([]); // nobody reads that inbox any more: it must not fill

    // A page asks for the empty seat, then cancels while the welcome is being unpacked: it stays out.
    const db = bus('kd');
    let d: Page | null = null;
    const on = db.on.bind(db);
    db.on = (topic, fn) => on(topic, (data, from) => {
      fn(data, from);
      if (topic === 'nc' && (data as { t?: string }).t === 'welcome') d!.leave();
    });
    d = new NetPlay(db, createWorld(9, 1), 'arena', () => {});
    play(ab, 400);
    d.join(match);
    await vi.waitFor(() => expect(d!.message).toBe('Left the match.'), { timeout: 5000 });
    // let the unpacking finish (real time: only the timers are faked)
    await new Promise<void>((r) => { const t0 = Date.now(); const k = () => (Date.now() - t0 > 300 ? r() : setImmediate(k)); k(); });
    expect(d.state).toBe('off');
    expect(d.session).toBe(null);
    vi.useRealTimers();
  });
});
