/**
 * One player's input for one tick. This record is the only thing that reaches the sim from
 * outside, and the only thing lockstep netcode will send. Every field is an integer, so it
 * encodes into a fixed 9 bytes and two peers can never read it differently.
 */
export interface PlayerInput {
  /** Held buttons, a BTN bitmask. Casts fire on the press edge (see step.ts). */
  buttons: number;
  /** Up to two element presses this tick, in order: element ids 1–9 (rules BASE order + 1), 0 = none. */
  press0: number;
  press1: number;
  /** Walk direction, -127..127 per axis (length is clamped to 127 in the sim). */
  moveX: number;
  moveY: number;
  /** Aim point relative to the wizard, in 1/32 world units. */
  aimX: number;
  aimY: number;
}

export const BTN = {
  force: 1 << 0,
  area: 1 << 1,
  self: 1 << 2,
  weapon: 1 << 3,
  clear: 1 << 4,
  /** A new player joins this seat (local co-op: any gamepad button). Part of the input so every peer joins on the same tick. */
  join: 1 << 5,
} as const;

export const INPUT_BYTES = 9;
export const AIM_UNIT = 1 / 32;

export const NO_INPUT: PlayerInput = Object.freeze({ buttons: 0, press0: 0, press1: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0 });

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** Rounds and clamps every field into its encoded range. Controllers call this before handing input over. */
export function quantize(i: PlayerInput): PlayerInput {
  return {
    buttons: clampInt(i.buttons, 0, 0xffff),
    press0: clampInt(i.press0, 0, 15),
    press1: clampInt(i.press1, 0, 15),
    moveX: clampInt(i.moveX, -127, 127),
    moveY: clampInt(i.moveY, -127, 127),
    aimX: clampInt(i.aimX, -32768, 32767),
    aimY: clampInt(i.aimY, -32768, 32767),
  };
}

export function encodeInput(i: PlayerInput, view: DataView, offset: number): void {
  view.setUint16(offset, i.buttons, true);
  view.setUint8(offset + 2, (i.press0 & 15) | ((i.press1 & 15) << 4));
  view.setInt8(offset + 3, i.moveX);
  view.setInt8(offset + 4, i.moveY);
  view.setInt16(offset + 5, i.aimX, true);
  view.setInt16(offset + 7, i.aimY, true);
}

export function decodeInput(view: DataView, offset: number): PlayerInput {
  const presses = view.getUint8(offset + 2);
  return {
    buttons: view.getUint16(offset, true),
    press0: presses & 15,
    press1: presses >>> 4,
    moveX: view.getInt8(offset + 3),
    moveY: view.getInt8(offset + 4),
    aimX: view.getInt16(offset + 5, true),
    aimY: view.getInt16(offset + 7, true),
  };
}
