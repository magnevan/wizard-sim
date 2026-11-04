import { describe, expect, it, vi } from 'vitest';
import { BTN, NO_INPUT, createWorld, hashWorld, quantize } from '@wizard-sim/sim';
import type { Bus } from '../src/net/bus';

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
      on: (topic, fn) => { me.handlers.set(topic, [...(me.handlers.get(topic) ?? []), fn]); },
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

  it('refuses to join a host with a different tuning', async () => {
    const { NetPlay } = await import('../src/net/netplay');
    const { findTunable, resetTuning } = await import('@wizard-sim/sim');
    const bus = hub();
    const a = new NetPlay(bus('h'), createWorld(1, 1), 'sanctum', () => {});
    const b = new NetPlay(bus('j'), createWorld(1, 1), 'sanctum', () => {});
    a.host();
    findTunable('runes.regen')!.set(0.9);
    b.join([...(b as unknown as { open: Map<string, unknown> }).open.keys()][0]);
    expect(b.state).toBe('off');
    expect(b.message).toMatch(/Tunings differ/);
    resetTuning();
  });
});
