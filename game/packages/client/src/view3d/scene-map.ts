/**
 * Where the sim's world sits in the kit scene: 1 sim u is 1 kit u, the scene's x is the sim's x and three's z is the
 * sim's y (kit-render.ts: three's y is height, metres * M). Only the origin moves: a sim point (x, y) is drawn at
 * scene (x + ox, y + oy).
 *
 * A room made from a kit scene (tools/kit/room.py -> content/generated/rooms/<scene>.room.json) covers the scene
 * exactly, centred on the sim's origin, so its `toScene` is half its size ([102, 81] for the court; the content tests
 * check that it is). The view sets it from the world's room with setSceneOrigin.
 */
import type { RoomDef } from '@wizard-sim/sim';

const TO_SCENE: [number, number] = [102, 81];

/** The scene origin for a room made from a kit scene: its size halved (the room file's toScene). */
export function setSceneOrigin(def: Pick<RoomDef, 'w' | 'h'>): void { TO_SCENE[0] = def.w / 2; TO_SCENE[1] = def.h / 2; }

/** Sim x, y -> scene x, z (u). */
export const sceneX = (x: number): number => x + TO_SCENE[0];
export const sceneZ = (y: number): number => y + TO_SCENE[1];
/** Scene x, z (u) -> sim x, y. */
export const simX = (sx: number): number => sx - TO_SCENE[0];
export const simY = (sz: number): number => sz - TO_SCENE[1];
