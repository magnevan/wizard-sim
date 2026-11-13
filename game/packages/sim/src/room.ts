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

/**
 * A placed prop, drawn by the client from the asset registry. A blocking one also has walls in propRock. A `tag` gives
 * it a part in the game: code finds it by tag (the battery's tower, circle, stakes, well), never by its art.
 */
export interface PropDef { readonly asset: string; readonly x: number; readonly y: number; readonly blocks: boolean; readonly tag?: string }

/** A named spot (LDtk Marker) for a room's encounter script and code; `tag` groups several. */
export interface MarkerDef { readonly id: string; readonly x: number; readonly y: number; readonly tag?: string }

/** A named rectangle (LDtk Region): x, y its top-left (smallest) corner, w and h its size, in world units. */
export interface RegionDef { readonly id: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number }

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
  /** Furniture and decoration. The sim never reads this; the client draws it. */
  readonly props: readonly PropDef[];
  /** The blocking props' footprints as static rock: they stop bodies and shots like rock, and aren't drawn as walls. */
  readonly propRock: readonly Seg[];
  /** Named spots and areas for the encounter script (encounter.ts) and code. Ids are unique across both. */
  readonly markers: readonly MarkerDef[];
  readonly regions: readonly RegionDef[];
}

/** The props with this tag, in map order. */
export const propsTagged = (def: RoomDef, tag: string): readonly PropDef[] => def.props.filter((p) => p.tag === tag);
/** The marker called `id`, or undefined. */
export const markerOf = (def: RoomDef, id: string): MarkerDef | undefined => def.markers.find((m) => m.id === id);
/** The markers with this tag, in map order. */
export const markersTagged = (def: RoomDef, tag: string): readonly MarkerDef[] => def.markers.filter((m) => m.tag === tag);
/** The region called `id`, or undefined. */
export const regionOf = (def: RoomDef, id: string): RegionDef | undefined => def.regions.find((g) => g.id === id);
/** Is (x, y) inside region g? */
export const inRegion = (g: RegionDef, x: number, y: number): boolean => x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;

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
