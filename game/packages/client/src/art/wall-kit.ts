/**
 * Room walls from a bought building kit (content/assets/kits, tools/art-import/kits.py). A kit piece is
 * a wall along one edge of a 48 x 24 diamond tile, so it repeats exactly along the two directions a
 * room's straight walls run in on screen. Walls at any other angle, and walls a player raises,
 * are drawn by art/walls.ts.
 *
 * Far walls stand full height. Near walls are cut low, or they'd hide the room.
 */
import { Rectangle, Texture } from 'pixi.js';
import { loadTexture } from './assets';

export type Side = 'n' | 'w' | 's' | 'e';
export interface Stamp { side: Side; x: number; y: number; /** Art px of the piece's ground edge to show (24 is all of it). */ part: number; /** The ground y to sort by: a far wall stands behind whatever is against it. */ z: number; /** Where it stands, for the lighting. */ foot: number }

/** Where a run's start sits in each 76 x 86 piece: the upper end of the tile edge that piece stands on. */
const ANCHOR: Readonly<Record<Side, readonly [number, number]>> = { n: [38, 55], w: [38, 55], s: [14, 67], e: [62, 67] };
/** Moves a piece onto the wall's centre line: the kit stands walls just inside the tile's edge. */
const SHIFT: Readonly<Record<Side, readonly [number, number]>> = { n: [4, -2], w: [-4, -2], s: [-4, 2], e: [4, 2] };
const STEP_X = 24, STEP_Y = 12;
/** A far wall steps down the screen, so a wide prop against it can reach the next piece along: far walls sort this much earlier. */
const FAR_MARGIN = 28;

/**
 * The pieces for a wall from (ax, ay) to (bx, by) in field px, or null if it doesn't run along a tile
 * edge. realX, realY: its middle in world units, which tells a far wall from a near one. open: an open area's wall,
 * which has ground on both sides, so it stands full height and whatever is north of it goes behind it.
 */
export function kitRun(ax: number, ay: number, bx: number, by: number, realX: number, realY: number, open = false): Stamp[] | null {
  const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
  if (dx < 4 || Math.abs(dy * 2 - dx) > 2) return null;
  const [sx, sy, ex] = ay <= by ? [ax, ay, bx] : [bx, by, ax];
  const right = ex > sx, side: Side = right ? (open || realY < 0 ? 'n' : 's') : (open || realX < 0 ? 'w' : 'e');
  const [ox, oy] = ANCHOR[side], [mx, my] = SHIFT[side], n = Math.ceil(dx / STEP_X), out: Stamp[] = [];
  for (let i = 0; i < n; i++) {
    const px = Math.round(sx + (right ? i : -i) * STEP_X), py = Math.round(sy + i * STEP_Y);
    out.push({ side, x: px - ox + mx, y: py - oy + my, part: i < n - 1 ? STEP_X : Math.max(1, Math.round(dx - STEP_X * (n - 1))), z: open ? py + STEP_Y / 2 : side === 'n' || side === 'w' ? py - FAR_MARGIN : py + STEP_Y, foot: py + STEP_Y / 2 });
  }
  return out;
}

const urls = import.meta.glob<string>('../../../../content/assets/kits/*/*.png', { eager: true, query: '?url', import: 'default' });
const urlOf = new Map(Object.entries(urls).map(([path, url]) => [path.split('/').slice(-2).join('/'), url]));

/**
 * The kit a room's straight walls are built from. Rooms not listed keep the drawn walls: tall kit walls
 * hide the action in an open arena like Survive, and its angled walls have no kit pieces to match.
 */
const ROOM_KIT: Readonly<Record<string, string>> = { academy: 'academy', battery: 'fortification' };
export const kitOf = (room: string): string | undefined => ROOM_KIT[room];

/** Areas whose wall runs through the middle, not round the edge: it faces you and stands full height wherever it is. */
const OPEN_AREAS: ReadonlySet<string> = new Set(['battery']);
export const wallsAllFar = (room: string): boolean => OPEN_AREAS.has(room);

const SIDES: readonly Side[] = ['n', 'w', 's', 'e'];
const loaded = new Map<string, Partial<Record<Side, Texture>>>();
const asked = new Set<string>();
const cut = new Map<string, { tex: Texture; dx: number }>();

/** The kit's pieces, or null until they've all arrived. */
function pieces(kit: string): Partial<Record<Side, Texture>> | null {
  const have = loaded.get(kit);
  if (have) return have;
  if (!asked.has(kit)) {
    asked.add(kit);
    void Promise.all(SIDES.map((s) => loadTexture(urlOf.get(`${kit}/${s}.png`)!))).then((t) => loaded.set(kit, { n: t[0], w: t[1], s: t[2], e: t[3] }));
  }
  return null;
}

/** The texture for a stamp, cropped along the wall if it's a part piece, and how far right to move it for that crop. Null until loaded. */
export function stampTexture(kit: string, st: Stamp): { tex: Texture; dx: number } | null {
  const p = pieces(kit)?.[st.side];
  if (!p) return null;
  if (st.part >= STEP_X) return { tex: p, dx: 0 };
  const key = `${kit}|${st.side}|${st.part}`;
  let c = cut.get(key);
  if (!c) {
    const [ox] = ANCHOR[st.side], w = p.width, h = p.height;
    // runs heading right keep the piece's left, runs heading left keep its right
    const fromLeft = st.side === 'n' || st.side === 's', keep = fromLeft ? ox + st.part : w - (ox - st.part);
    const x0 = fromLeft ? 0 : ox - st.part;
    c = { tex: new Texture({ source: p.source, frame: new Rectangle(x0, 0, keep, h) }), dx: x0 };
    cut.set(key, c);
  }
  return c;
}
