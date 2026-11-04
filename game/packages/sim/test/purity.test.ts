/**
 * The sim's determinism rules, checked as source text so they fail fast and name the line.
 * Allowed Math: abs, min, max, floor, ceil, round, trunc, sign, sqrt, imul, fround (all exact).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '../src');
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

const BANNED: [RegExp, string][] = [
  [/\bMath\.(random|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|pow|hypot|cbrt)\b/, 'not bit-identical across JS engines: use trig.ts or exact ops'],
  [/\*\*/, '`**` is Math.pow: not bit-identical across engines'],
  [/\b(Date|performance)\b/, 'no wall-clock time in the sim'],
  [/\b(setTimeout|setInterval|requestAnimationFrame|queueMicrotask|Promise|async|await)\b/, 'no async or timers in the sim'],
  [/\b(window|document|globalThis|navigator|localStorage)\b/, 'no host APIs in the sim'],
  [/\bfor\s*\(\s*(const|let|var)\s+\w+\s+in\b/, 'for-in order depends on how keys were added: iterate arrays by index'],
  [/\.sort\(\s*\)/, 'sort needs an explicit comparator'],
  [/\bnew (Map|Set|WeakMap)\b/, 'gameplay state lives in typed arrays (Map/Set order depends on insertion history)'],
];

describe('sim source purity', () => {
  for (const f of files) {
    it(f, () => {
      const text = readFileSync(join(SRC, f), 'utf8');
      const lines = text.split('\n');
      // Blank out block comments but keep line numbers.
      const codeLines = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
      const problems: string[] = [];
      lines.forEach((line, n) => {
        const code = codeLines[n].replace(/\/\/.*$/, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
        for (const [re, why] of BANNED) if (re.test(code)) problems.push(`${f}:${n + 1}: ${line.trim()}  <- ${why}`);
      });
      const imports = lines.filter((l) => /^import\b/.test(l)).map((l) => /from '([^']+)'/.exec(l)?.[1] ?? /import '([^']+)'/.exec(l)?.[1]);
      for (const m of imports) if (m && !m.startsWith('./') && m !== '@wizard-sim/rules') problems.push(`${f}: imports ${m}  <- the sim may only import itself and @wizard-sim/rules`);
      expect(problems).toEqual([]);
    });
  }
});
