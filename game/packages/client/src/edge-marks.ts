/**
 * Off-screen marks in the pixel view: edge-marks-core.ts works out the pixels (what they show is described there),
 * and this fills them into a Pixi Graphics in the HUD layer.
 */
import { Graphics } from 'pixi.js';
import type { World } from '@wizard-sim/sim';
import type { Camera } from './camera';
import { EdgeMarksCore, type RectSink } from './edge-marks-core';

export class EdgeMarks {
  readonly g = new Graphics();
  private core = new EdgeMarksCore();
  private sink: RectSink = (rects, col) => {
    for (const [x, y, w, h] of rects) this.g.rect(x, y, w, h);
    this.g.fill(col);
  };

  draw(w: World, cam: Camera, ct: number, at: (i: number) => [number, number]): void {
    this.g.clear();
    this.core.draw(w, cam, ct, at, this.sink);
  }
}
