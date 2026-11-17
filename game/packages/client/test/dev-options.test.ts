/**
 * The URL options registry (dev-options.ts): every ?key the game reads is declared there, so the Tune
 * panel can show it and nobody has to guess. These checks keep it that way.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OPTIONS, changedSinceBoot, opt, optNum, optOn, optionOf, seedOpt, setOpt, type OptionKey } from '../src/dev-options';

const SRC = join(__dirname, '../src');
const SCRIPTS = join(__dirname, '../../../scripts');
const files = (dir: string, ext: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name), ext) : d.name.endsWith(ext) ? [join(dir, d.name)] : []));
const rel = (f: string) => relative(SRC, f).replace(/\\/g, '/');

/** Files allowed to parse a query string: the registry, scenarios.ts (handed the string), and the labs (pages of their own). */
const MAY_PARSE = (f: string) => ['dev-options.ts', 'scenarios.ts'].includes(rel(f)) || rel(f).startsWith('lab/');

describe('URL options', () => {
  afterEach(() => { for (const o of OPTIONS) setOpt(o.key, null, false); });

  it('each key once, each with a label and help', () => {
    const keys = OPTIONS.map((o) => o.key);
    expect(new Set(keys).size).toBe(keys.length);
    const bad = OPTIONS.filter((o) => !o.label || o.help.length < 4);
    expect(bad.map((o) => o.key)).toEqual([]);
  });

  it('every choice list loads and is non-empty', () => {
    const empty = (OPTIONS as readonly { key: string; kind: string; choices?: () => readonly string[] }[]).filter((o) => o.kind === 'choice' && !(o.choices?.().length));
    expect(empty.map((o) => o.key)).toEqual([]);
  });

  it('nothing in src/ reads the URL behind the registry\'s back', () => {
    const offenders = files(SRC, '.ts').filter((f) => !MAY_PARSE(f) && /URLSearchParams\s*\(/.test(readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('every ?key a script loads the game with is registered (lab pages excepted)', () => {
    const labKeys = new Set(files(join(SRC, 'lab'), '.ts').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/q\.(?:get|has)\('([\w-]+)'\)/g)].map((m) => m[1])));
    const unknown = new Set<string>();
    for (const f of files(SCRIPTS, '.mjs')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/[?&]([a-zA-Z][\w-]*)=/g)) if (!optionOf(m[1]) && !labKeys.has(m[1])) unknown.add(`${m[1]} (${f.split(/[\\/]/).pop()})`);
    }
    expect([...unknown]).toEqual([]);
  });

  it('flags read =1, or for a default-on flag anything but =0', () => {
    expect(optOn('ally')).toBe(false);
    setOpt('ally', '1', false);
    expect(optOn('ally')).toBe(true);
    expect(optOn('lights')).toBe(true);
    setOpt('lights', '0', false);
    expect(optOn('lights')).toBe(false);
  });

  it('numbers fall back when absent or not numbers', () => {
    expect(optNum('beat')).toBe(0);
    expect(optNum('face', 0.06)).toBe(0.06);
    setOpt('face', 'abc', false);
    expect(optNum('face', 0.06)).toBe(0.06);
    setOpt('face', '0.25', false);
    expect(optNum('face', 0.06)).toBe(0.25);
  });

  it('a boot-time option set later asks for a reload; one seeded at boot does not', () => {
    const k: OptionKey = 'massing';
    expect(changedSinceBoot(k)).toBe(false);
    setOpt(k, 'academy', false);
    expect(changedSinceBoot(k)).toBe(true);
    setOpt(k, null, false);
    expect(changedSinceBoot(k)).toBe(false);
    seedOpt('beat', '7');
    expect(opt('beat')).toBe('7');
    expect(changedSinceBoot('beat')).toBe(false);
  });
});
