// Rooms made from kit scenes (docs/explorations/2026-11-25-port-3d-plan.md, decision 1): tools/kit/room.py writes
// game/content/generated/rooms/<scene>.room.json from tools/kit/scenes/<scene>.scene.json, and the build folds its
// `room` into rooms.gen.ts as the room called <scene>, in place of an LDtk level of that name (the court's LDtk level
// stays on disk, unbuilt: tools/place-plans/to_ldtk.py copies it as a template). CI never runs Python, so the file is
// committed, and the check fails once the scene has moved on from the hash the file was made from.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT, GAME } from './ldtk.mjs';

/** The exported rooms: generated/rooms/<scene>.room.json. */
export const SCENE_ROOMS = join(CONTENT, 'generated/rooms');
/** The kit's scenes, the source each room file names. */
export const KIT_SCENES = join(GAME, '..', 'tools/kit/scenes');

/**
 * The scene file's hash as tools/kit/room.py takes it: sha256 over its bytes with CRLF read as LF (a Windows checkout),
 * the first 16 hex digits.
 */
export function sceneHash(file) {
  const bytes = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(bytes, 'utf8').digest('hex').slice(0, 16);
}

/** Every room file: [{ file, doc }] in name order. */
export function loadSceneRooms(dir = SCENE_ROOMS) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.room.json')).sort()
    .map((f) => ({ file: join(dir, f), doc: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}

/** The ids of the scene-made rooms (they replace any LDtk level of the same name). */
export const sceneRoomIds = (dir = SCENE_ROOMS) => new Set(loadSceneRooms(dir).map(({ doc }) => doc.room?.id));

/**
 * A room file's room in the build's key order (the order the room hash is taken over, as compileLevel makes it), and
 * the problems with it. The sim gets the room only; the file's height3d stays out of the build until the sim reads it.
 */
export function sceneRoom({ file, doc }, scenes = KIT_SCENES) {
  const errors = [], r = doc.room ?? {}, where = `${doc.scene ?? file}.room.json`;
  if (!r.id || r.id !== doc.scene) errors.push(`${where}: its room id (${r.id}) must be its scene's name (${doc.scene})`);
  const gw = Math.round(r.w / 0.5), gh = Math.round(r.h / 0.5);
  if (!Array.isArray(r.terrain) || r.terrain.length !== gh || r.terrain.some((row) => row.length !== gw)) errors.push(`${where}: terrain isn't ${gw} x ${gh} cells`);
  if (r.height && (r.height.rows.length !== gh || r.height.rows.some((row) => row.length !== gw))) errors.push(`${where}: height rows aren't ${gw} x ${gh} cells`);
  if (!Array.isArray(r.starts) || r.starts.length !== 4) errors.push(`${where}: needs four starts (markers start-0 to start-3 in the scene)`);
  const src = join(scenes, `${doc.scene}.scene.json`);
  if (!existsSync(src)) errors.push(`${where}: its scene ${src} is missing`);
  else if (sceneHash(src) !== doc.sceneHash) errors.push(`${where} is stale: tools/kit/scenes/${doc.scene}.scene.json has changed since it was exported: run \`python tools/kit/room.py ${doc.scene}\`, then \`npm run content:build\``);
  const room = {
    id: r.id, w: r.w, h: r.h, terrain: r.terrain ?? [], rock: r.rock ?? [], starts: r.starts ?? [], dummies: r.dummies ?? [], portals: r.portals ?? [],
    altars: r.altars ?? [], props: r.props ?? [], propRock: r.propRock ?? [],
    markers: (r.markers ?? []).map((m) => (m.tag ? { id: m.id, x: m.x, y: m.y, tag: m.tag } : { id: m.id, x: m.x, y: m.y })),
    regions: r.regions ?? [],
  };
  if (r.height) room.height = { metres: r.height.metres, rows: r.height.rows, cliffs: r.height.cliffs };
  return { room, errors };
}
