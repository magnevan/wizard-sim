/**
 * The lighting moods' numbers (art/lighting.ts draws them), and the asset registry's prop sets (art/assets.ts). Kept
 * apart from those Pixi modules so dev-options.ts can list them without pulling Pixi into the 3D page.
 */
type RGB = readonly [number, number, number];
export interface Mood {
  /** What unlit ground and bodies are multiplied by. */
  ambient: RGB;
  /** The colour of a cast shadow. Hue-shifted, never plain grey. */
  shadow: RGB;
  /** Shadow length per art px of height: to the right and down the screen. 0, 0 casts none. */
  sun: readonly [number, number];
  /** -1 to 1: 0 leaves colour alone. */
  saturate: number;
  /** How dark passing cloud shade gets, 0 for none. */
  clouds: number;
  /** How dark the screen's corners get. */
  vignette: number;
  /** How bright the small light each wizard carries is. */
  carry: number;
}

export const MOODS: Readonly<Record<string, Mood>> = {
  day: { ambient: [0.94, 0.92, 0.87], shadow: [0.62, 0.62, 0.76], sun: [0.55, 0.28], saturate: -0.14, clouds: 0.1, vignette: 0.16, carry: 0 },
  dusk: { ambient: [0.76, 0.66, 0.7], shadow: [0.48, 0.44, 0.62], sun: [0.95, 0.42], saturate: -0.2, clouds: 0.06, vignette: 0.32, carry: 0.2 },
  night: { ambient: [0.38, 0.44, 0.66], shadow: [0.26, 0.3, 0.48], sun: [0.3, 0.15], saturate: -0.34, clouds: 0, vignette: 0.42, carry: 0.55 },
  interior: { ambient: [0.68, 0.61, 0.6], shadow: [0.48, 0.44, 0.54], sun: [0.18, 0.1], saturate: -0.12, clouds: 0, vignette: 0.36, carry: 0.32 },
};

/** The art treatments a prop can have (art/assets.ts). */
export const PROP_SETS = ['lean', 'simple', 'code'] as const;
