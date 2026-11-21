/** The build's lockstep fingerprint (vite.config.ts simBuild): pages with different ones can't share a match. */
declare const __SIM_BUILD__: string | undefined;
export const SIM_BUILD: string = typeof __SIM_BUILD__ === 'string' ? __SIM_BUILD__ : 'dev';
/** The commit the build was made from (vite.config.ts gitCommit), for bug reports (report.ts). */
declare const __BUILD_COMMIT__: string | undefined;
export const BUILD_COMMIT: string = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'dev';
