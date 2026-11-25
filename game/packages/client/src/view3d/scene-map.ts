/**
 * Where the sim's world sits in the kit scene: 1 sim u is 1 kit u, the scene's x is the sim's x and three's z is the
 * sim's y (kit-render.ts: three's y is height, metres * M). Only the origin moves: a sim point (x, y) is drawn at
 * scene (x + ox, y + oy).
 *
 * TODO(port-3d, decision 1): the offset is to come from the room the map agent's exporter writes
 * (`toScene: [ox, oy]`, branch p3d-map). Until it lands, the sim still walks today's LDtk court (261 x 260 u, plan D),
 * a different map from the kit's court (204 x 162 u), and this constant lines the two up on the armillary: the sim's
 * at (-5.75, 4.75), the scene's at (95, 80). Walls and terraces only roughly agree away from the plaza.
 */
export const TO_SCENE: readonly [number, number] = [100.75, 75.25];

/** Sim x, y -> scene x, z (u). */
export const sceneX = (x: number): number => x + TO_SCENE[0];
export const sceneZ = (y: number): number => y + TO_SCENE[1];
/** Scene x, z (u) -> sim x, y. */
export const simX = (sx: number): number => sx - TO_SCENE[0];
export const simY = (sz: number): number => sz - TO_SCENE[1];
