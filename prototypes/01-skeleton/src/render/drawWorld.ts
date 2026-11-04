import type { World } from '../world/world';

const FLOOR_A = '#2b2733';
const FLOOR_B = '#302b39';
const GRID = 'rgba(255,255,255,0.035)';
const WALL_TOP = '#5b5368';
const WALL_SIDE = '#3b3545';
const WALL_EDGE = '#7a7090';

/** Floor tiles plus a faint 1-unit grid. Everything here is in world units. */
export function drawFloor(ctx: CanvasRenderingContext2D, world: World): void {
  const tile = 2;
  for (let y = 0; y < world.height; y += tile) {
    for (let x = 0; x < world.width; x += tile) {
      ctx.fillStyle = ((x + y) / tile) % 2 === 0 ? FLOOR_A : FLOOR_B;
      ctx.fillRect(x, y, tile, tile);
    }
  }
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  for (let x = 0; x <= world.width; x++) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.height);
  }
  for (let y = 0; y <= world.height; y++) {
    ctx.moveTo(0, y);
    ctx.lineTo(world.width, y);
  }
  ctx.stroke();
}

/** Walls as raised blocks: a darker front face below a lighter top. */
export function drawWalls(ctx: CanvasRenderingContext2D, world: World): void {
  const lip = 0.35;
  for (const w of world.walls) {
    ctx.fillStyle = WALL_SIDE;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = WALL_TOP;
    ctx.fillRect(w.x, w.y - lip, w.w, w.h);
    ctx.strokeStyle = WALL_EDGE;
    ctx.lineWidth = 0.05;
    ctx.strokeRect(w.x, w.y - lip, w.w, w.h);
  }
}
