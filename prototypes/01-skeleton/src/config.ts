// Global tuning knobs. Gameplay numbers for spells live in the resolver.

export const SIM_HZ = 60;

export const CAMERA = {
  /** World units visible vertically at zoom 1. Larger = more zoomed out (Magicka felt ~13). */
  viewHeight: 17,
  minZoom: 0.6,
  maxZoom: 1.8,
  /** Co-op framing: zoom out at most this far to keep all players on screen. */
  minFit: 0.6,
  /** Margin around the players' bounding box when framing, in world units. */
  frameMargin: 5,
  /** Exponential follow rate (1/s). */
  followRate: 6,
  /** Look-ahead below the player, in world units, so the bottom HUD hides less of the room. */
  offsetY: 1.2,
};

export const PLAYER = {
  radius: 0.45,
  speed: 4.2,
  hp: 120,
  respawnDelay: 3,
  /** Cursor closer than this to the wizard: stop walking (avoids jitter). */
  moveDeadzone: 0.35,
};

/** A cast pressed while busy waits this long for the caster to become free. */
export const CAST_BUFFER_SECONDS = 0.6;

export const PLAYER_COLORS = ['#4f8cff', '#ff5a5a', '#5cd65c', '#f2c94c'];
