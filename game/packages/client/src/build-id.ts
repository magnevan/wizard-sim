/** The build's lockstep fingerprint (vite.config.ts simBuild): pages with different ones can't share a match. */
declare const __SIM_BUILD__: string | undefined;
export const SIM_BUILD: string = typeof __SIM_BUILD__ === 'string' ? __SIM_BUILD__ : 'dev';
