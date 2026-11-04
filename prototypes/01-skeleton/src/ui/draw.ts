// Shared screen-space drawing helpers for UI.

export const UI_FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.72): void {
  ctx.fillStyle = `rgba(14,11,22,${alpha})`;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
}

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  opts: { size?: number; weight?: number; color?: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline } = {},
): number {
  ctx.font = `${opts.weight ?? 500} ${opts.size ?? 13}px ${UI_FONT}`;
  ctx.fillStyle = opts.color ?? '#e9e3f5';
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = opts.baseline ?? 'alphabetic';
  ctx.fillText(s, x, y);
  return ctx.measureText(s).width;
}

/** 'KeyQ' -> 'Q', 'Digit1' -> '1'. */
export function keyLabel(code: string): string {
  return code.replace(/^Key/, '').replace(/^Digit/, '');
}
