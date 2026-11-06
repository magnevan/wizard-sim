/**
 * The local baseline (dev server only). If this machine has a reference set in the gitignored .reference
 * folder (vite.config.ts), its kits take over for every element they cover, so we can build and judge the
 * game against sounds that already work. Anything a kit leaves out falls through to our own sounds, and our
 * own replace these a kit at a time. None of it is in the repo or a build: the public game never has it.
 * ?baseline=0 turns it off.
 */
import type { GameAudio } from './game-audio';
import { useKit, type Kit } from './kits';
import type { ElementName } from './recipes';

/** Clips decoded at once: they're large, and there's no hurry. */
const BATCH = 4;

let loading: Promise<Partial<Record<ElementName, Kit>> | null> | null = null;

async function load(audio: GameAudio): Promise<Partial<Record<ElementName, Kit>> | null> {
  const r = await fetch('/__ref/baseline.json');
  if (!r.ok) return null;
  const kits = await r.json() as Partial<Record<ElementName, Kit>>;
  for (let tries = 0; !audio.engine && tries < 300; tries++) await new Promise((f) => setTimeout(f, 100));
  const e = audio.engine;
  if (!e) return null;
  const layers = Object.values(kits).flatMap((k) => Object.values(k ?? {})).flat();
  const ids = [...new Set(layers.flatMap((l) => l.clips))], looped = new Set(layers.filter((l) => l.loop).flatMap((l) => l.clips));
  for (let i = 0; i < ids.length; i += BATCH) {
    await Promise.all(ids.slice(i, i + BATCH).map(async (id) => {
      const f = await fetch(`/__ref/${id}.wav`);
      if (f.ok) e.addClip(id, await e.ctx.decodeAudioData(await f.arrayBuffer()), looped.has(id));
    }));
  }
  for (const [el, kit] of Object.entries(kits)) if (kit && Object.keys(kit).length) useKit(el as ElementName, kit);
  audio.director.restartLoops(); // anything that started before its clips were here
  return kits;
}

/** Loads the baseline once, and gives each element its kit. Null if this machine hasn't got one. */
export function loadBaseline(audio: GameAudio): Promise<Partial<Record<ElementName, Kit>> | null> {
  return (loading ??= load(audio).catch(() => null));
}
