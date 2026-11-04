/**
 * Fixed-timestep driver: the simulation always advances in equal steps,
 * rendering happens once per animation frame.
 */
export class FixedStep {
  private acc = 0;
  private last: number | null = null;
  ticks = 0;

  constructor(
    readonly step: number,
    private readonly maxFrame = 0.25,
  ) {}

  /** Returns how many sim steps to run for this frame. */
  advance(nowMs: number): number {
    const frame = this.last === null ? 0 : Math.min(this.maxFrame, (nowMs - this.last) / 1000);
    this.last = nowMs;
    this.acc += frame;
    let n = 0;
    while (this.acc >= this.step) {
      this.acc -= this.step;
      n++;
    }
    this.ticks += n;
    return n;
  }
}

/** Smoothed frames-per-second counter for the debug overlay. */
export class FpsCounter {
  fps = 0;
  private last: number | null = null;

  frame(nowMs: number): void {
    if (this.last !== null) {
      const inst = 1000 / Math.max(1, nowMs - this.last);
      this.fps = this.fps === 0 ? inst : this.fps * 0.9 + inst * 0.1;
    }
    this.last = nowMs;
  }
}
