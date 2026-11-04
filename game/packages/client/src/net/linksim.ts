/**
 * A pretend slow link, for feeling online play on one machine: extra round-trip lag, jitter and
 * packet loss on this page's match traffic, both ways. Set from the tuning panel's Network test
 * section. It only touches this page, so one page alone makes the whole match feel far away.
 * Client-side randomness (Math.random): it decides when packets arrive, never what the sim does.
 */
export class LinkSim {
  /** Added round trip, ms (half each way). */
  lag = 0;
  /** Up to this much more, ms, at random per packet (packets may then arrive out of order, as on a real link). */
  jitter = 0;
  /** Percent of match packets dropped, each way. */
  loss = 0;

  get active(): boolean { return this.lag > 0 || this.jitter > 0 || this.loss > 0; }

  /** Runs `fn` as if it had crossed this page's half of the link. Control messages pass `lossy = false`. */
  pass(fn: () => void, lossy = true): void {
    if (lossy && this.loss > 0 && Math.random() * 100 < this.loss) return;
    const ms = this.lag / 2 + (Math.random() * this.jitter) / 2;
    if (ms <= 0) fn(); else setTimeout(fn, ms);
  }
}

export const PRESETS: { name: string; lag: number; jitter: number; loss: number }[] = [
  { name: 'Off', lag: 0, jitter: 0, loss: 0 },
  { name: 'Same city', lag: 30, jitter: 10, loss: 0 },
  { name: 'Far', lag: 100, jitter: 20, loss: 1 },
  { name: 'Overseas', lag: 200, jitter: 30, loss: 1 },
  { name: 'Bad wifi', lag: 120, jitter: 120, loss: 5 },
];
