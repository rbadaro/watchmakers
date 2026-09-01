#!/usr/bin/env node
/** Smoke check: priceFromGBP + fromLine over every maker YAML. Run after seeding. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { priceFromGBP, fromLine } from '../src/lib/prices.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const fx = JSON.parse(readFileSync(join(ROOT, 'data/fx-gbp.json'), 'utf8'));

const rows = [];
for (const f of readdirSync(join(ROOT, 'src/content/makers')).filter((x) => x.endsWith('.yaml'))) {
  const m = load(readFileSync(join(ROOT, 'src/content/makers', f), 'utf8'));
  const gbp = priceFromGBP(m, fx);
  rows.push({
    name: m.name,
    tier: m.tier,
    fromLine: fromLine(m, fx),
    gbp: gbp == null ? null : Math.round(gbp),
  });
}
rows.sort((a, b) => (b.gbp ?? -1) - (a.gbp ?? -1));
for (const r of rows) {
  console.log(`${r.tier}  ${String(r.gbp ?? 'null').padStart(9)}  ${r.name}  ::  ${r.fromLine ?? '(no price line)'}`);
}
const unknown = rows.filter((r) => r.gbp == null).map((r) => r.name);
console.log(`\nunknown price (sorts last): ${unknown.length} -> ${unknown.join(' | ')}`);
