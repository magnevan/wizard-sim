/**
 * A room's layout: compiled from the LDtk maps in game/content/maps by game/packages/content into
 * rooms.gen.ts, which is plain data. The sim never reads a file; `npm run content:build` writes
 * the module and `npm run content:check` fails while it is stale.
 *
 * Coordinates are world units with the origin at the room's centre, y down. They are exact: the
 * build keeps every number as the map has it.
 */
export type Pt = readonly [number, number];
export type Seg = readonly [number, number, number, number];

export interface RoomDef {
  readonly id: string;
  /** The play area in world units, centred on the origin. */
  readonly w: number;
  readonly h: number;
  /** The Terrain layer, one row of characters per CELL from the top: '.' floor, '#' rock. */
  readonly terrain: readonly string[];
  /** Static rock walls (never break): the map's free Rock segments, then the outline of its painted rock. */
  readonly rock: readonly Seg[];
  /** Where seat 0-3's wizard appears. */
  readonly starts: readonly Pt[];
  /** Practice dummies standing when the room starts. */
  readonly dummies: readonly Pt[];
  /** Where enemy portals can open, in order (ties go to the first). */
  readonly portals: readonly Pt[];
  /** Survive's altar spots (left, middle, right). */
  readonly altars: readonly Pt[];
}

/**
 * The room's hash: FNV-1a over its JSON (numbers print the same in every engine). Peers compare
 * these before a match, so different map versions refuse to start instead of desyncing.
 */
export function roomHash(def: RoomDef): number {
  const s = JSON.stringify(def);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
