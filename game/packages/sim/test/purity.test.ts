/**
 * The sim's determinism rules, checked as source text so they fail fast and name the line.
 * Allowed Math: abs, min, max, floor, ceil, round, trunc, sign, sqrt, imul, fround (all exact).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../src');
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));
/** The spell rules run inside every sim step too (generated from the Atlas, `npm run sync-rules`). */
const RULES = join(__dirname, '../../rules/src/rules-c.gen.js');

const MATH: [RegExp, string][] = [
  [/\bMath\.(random|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt)\b/, 'not bit-identical across JS engines: use trig.ts or exact ops'],
  [/\*\*/, '`**` is Math.pow: not bit-identical across engines'],
  [/\b(Date|performance)\b/, 'no wall-clock time in the sim'],
  [/\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask|Promise|async|await)\b/, 'no async or timers in the sim'],
  [/\bfor\s*\(\s*(const|let|var)\s+\w+\s+in\b/, 'for-in order depends on how keys were added: iterate arrays by index'],
  [/\.sort\(\s*\)/, 'sort needs an explicit comparator'],
];
const BANNED: [RegExp, string][] = [
  ...MATH,
  [/\b(window|document|globalThis|navigator|localStorage)\b/, 'no host APIs in the sim'],
  [/\bnew (Map|Set|WeakMap)\b/, 'gameplay state lives in typed arrays (Map/Set order depends on insertion history)'],
  [/\bimport\s*\(/, 'no dynamic imports in the sim'],
];

/** The source with comments and string contents blanked, line numbers kept. */
function codeOf(text: string): string[] {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlocks.split('\n').map((l) => l.replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''"));
}

function scan(name: string, text: string, rules: [RegExp, string][]): string[] {
  const lines = text.split('\n'), code = codeOf(text), problems: string[] = [];
  lines.forEach((line, n) => { for (const [re, why] of rules) if (re.test(code[n])) problems.push(`${name}:${n + 1}: ${line.trim()}  <- ${why}`); });
  return problems;
}

/** Every module an import or re-export names, including ones split over several lines. */
export function importsOf(text: string): string[] {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const out: string[] = [];
  for (const m of src.matchAll(/(?:^|[\n;])\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of src.matchAll(/(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  return out;
}

describe('sim source purity', () => {
  for (const f of files) {
    it(f, () => {
      const text = readFileSync(join(SRC, f), 'utf8');
      const problems = scan(f, text, BANNED);
      for (const m of importsOf(text)) if (!m.startsWith('./') && m !== '@wizard-sim/rules') problems.push(`${f}: imports ${m}  <- the sim may only import itself and @wizard-sim/rules`);
      expect(problems).toEqual([]);
    });
  }

  // The rules file is a browser/node UMD (it touches window/globalThis only to export itself) and uses
  // `new Set` as a local de-duplicate, whose order is insertion order; the numeric and ordering rules still apply.
  it('rules-c.gen.js', () => {
    expect(scan('rules-c.gen.js', readFileSync(RULES, 'utf8'), MATH)).toEqual([]);
  });

  it('sees imports split over several lines', () => {
    expect(importsOf("import {\n  a,\n  b,\n} from 'pixi.js';\nexport { c } from './x';\nimport './y';")).toEqual(['pixi.js', './x', './y']);
  });
});
