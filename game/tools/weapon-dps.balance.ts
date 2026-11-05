/**
 * Weapon vs spell DPS (npm run balance:weapons): every weapon's Strike, Heavy and Sweep spammed, and
 * the comparable spells, over 10 s and 30 s from full pools. Writes tools/weapon-dps-report.json.
 * The pilot and its rules are in weapon-dps.ts.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { table } from './weapon-dps';

it('weapon dps report', () => {
  const ten = table(10), thirty = table(30);
  const rows = ten.map((r, k) => ({
    row: r.name, dps10: r.dps, dps30: thirty[k].dps, runes30: thirty[k].runes, perRune30: thirty[k].perRune, dmg30: thirty[k].damage,
  }));
  writeFileSync(join(__dirname, 'weapon-dps-report.json'), JSON.stringify({ generated: 'npm run balance:weapons', rows }, null, 1));
  console.table(rows);
  expect(rows.length).toBeGreaterThan(10);
});
