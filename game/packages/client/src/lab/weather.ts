/**
 * The weather's knobs (2026-11-27): how hard and how fast the wind blows, how bright its sheen runs over long grass, and
 * how many, how dark, how big and how fast the cloud shadows are. Each is a shader uniform read by the foliage cards
 * (foliage.ts), the margin grass and the lawn's sheen (kit-ground.ts) and the cloud shadows (kit-ground.ts cloudify), so
 * a slider changes the scene at once. The defaults (all 1, cover 0.5) are the look as tuned; the Tools panel's Weather
 * section (F3) turns them up to check an effect is there at all.
 *
 * The wind and the clouds keep their own clocks (WIND_TIME, CLOUD_TIME), advanced by advanceWeather from the scene's
 * time at their own speeds, so changing a speed doesn't jump them. At speed 1 from time 0 a clock equals the scene's
 * time, so a still at &t= is the same picture as before.
 */

/** The defaults: the look as tuned. */
export const WEATHER_DEFAULTS = { wind: 1, windSpeed: 1, sheen: 1, clouds: 1, cover: 0.5, dark: 1, size: 1, cloudSpeed: 1 };
export type WeatherKey = keyof typeof WEATHER_DEFAULTS;
/** The uniforms (each {value}), shared by every material that reads the weather. */
export const WEATHER = Object.fromEntries(Object.entries(WEATHER_DEFAULTS).map(([k, v]) => [k, { value: v }])) as Record<WeatherKey, { value: number }>;
/** The wind's clock (s): the foliage's sway, the margin grass's bend and the lawn's sheen. */
export const WIND_TIME = { value: 0 };
/** The clouds' clock (s). */
export const CLOUD_TIME = { value: 0 };

let last: number | null = null;
/** Advance the wind's and the clouds' clocks to scene time t (s), each at its own speed. */
export function advanceWeather(t: number) {
  const dt = last === null || t < last ? null : t - last;
  last = t;
  if (dt === null) { WIND_TIME.value = t * WEATHER.windSpeed.value; CLOUD_TIME.value = t * WEATHER.cloudSpeed.value; return; }
  WIND_TIME.value += dt * WEATHER.windSpeed.value;
  CLOUD_TIME.value += dt * WEATHER.cloudSpeed.value;
}

const SLIDERS: { k: WeatherKey; label: string; max: number; step: number; help: string }[] = [
  { k: 'wind', label: 'Wind strength', max: 6, step: 0.1, help: 'How far plants, the edge grass and long grass lean in a gust' },
  { k: 'windSpeed', label: 'Wind speed', max: 6, step: 0.1, help: 'How fast gusts cross the ground and leaves flutter' },
  { k: 'sheen', label: 'Grass sheen', max: 8, step: 0.1, help: 'The bright bands rolling over long grass in a gust' },
  { k: 'cover', label: 'Cloud cover', max: 1, step: 0.01, help: 'How much of the ground lies under cloud (0 clear, 1 overcast)' },
  { k: 'dark', label: 'Cloud darkness', max: 3, step: 0.05, help: 'How much sun a cloud takes' },
  { k: 'size', label: 'Cloud size', max: 4, step: 0.05, help: 'How big each cloud is (1: about 11 m across)' },
  { k: 'cloudSpeed', label: 'Cloud speed', max: 30, step: 0.5, help: 'How fast clouds drift downwind' },
];
/** Exaggerated settings, to see each effect is there. */
const SHOW: Partial<Record<WeatherKey, number>> = { wind: 4, windSpeed: 2, sheen: 6, clouds: 1, cover: 0.5, dark: 2.2, size: 1, cloudSpeed: 15 };

/** A new element (the panels' own helper is in debug-panel.ts, which needs a page to load; this module is also loaded
 * by tests). */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
}
/** Fill a panel section with the weather's sliders (the Tools panel's Weather section). */
export function weatherControls(body: HTMLElement) {
  const sync: (() => void)[] = [];
  const row = (label: string, help: string, input: HTMLInputElement, out?: HTMLElement) => {
    const r = h('label', 'tl-row'); r.title = help;
    r.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0';
    const name = h('span', '', label); name.style.cssText = 'flex:0 0 108px';
    r.append(name, input); if (out) r.append(out);
    body.append(r);
  };
  const on = h('input'); on.type = 'checkbox';
  on.onchange = () => { WEATHER.clouds.value = on.checked ? 1 : 0; };
  sync.push(() => { on.checked = WEATHER.clouds.value > 0.5; });
  row('Clouds', 'Cloud shadows on or off', on);
  for (const s of SLIDERS) {
    const inp = h('input'), out = h('span', '', '');
    inp.type = 'range'; inp.min = '0'; inp.max = String(s.max); inp.step = String(s.step); inp.style.flex = '1';
    out.style.cssText = 'flex:0 0 34px;text-align:right;font-variant-numeric:tabular-nums';
    const show = () => { out.textContent = WEATHER[s.k].value.toFixed(s.step < 0.1 ? 2 : 1); };
    inp.oninput = () => { WEATHER[s.k].value = Number(inp.value); show(); };
    sync.push(() => { inp.value = String(WEATHER[s.k].value); show(); });
    row(s.label, s.help, inp, out);
  }
  const btns = h('div'); btns.style.cssText = 'display:flex;gap:6px;margin-top:4px';
  const set = (vals: Partial<Record<WeatherKey, number>>) => { for (const [k, v] of Object.entries(vals)) WEATHER[k as WeatherKey].value = v; for (const f of sync) f(); };
  const show = h('button', '', 'Show me'); show.title = 'Turn every effect well up, to see it working';
  show.onclick = () => set(SHOW);
  const reset = h('button', '', 'Reset'); reset.title = 'Back to the tuned look';
  reset.onclick = () => set(WEATHER_DEFAULTS);
  btns.append(show, reset); body.append(btns);
  for (const f of sync) f();
}
