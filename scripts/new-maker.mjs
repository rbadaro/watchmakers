#!/usr/bin/env node
/**
 * Scaffolds a valid maker YAML skeleton (SPEC section 8, step 2).
 *
 * Usage: node scripts/new-maker.mjs "Full Display Name" TIER
 * Writes src/content/makers/<slug>.yaml with required fields filled with
 * placeholder strings (schema-valid) and optional blocks commented out.
 * Do not commit placeholders; run pnpm validate after filling it in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [name, tier = 'D'] = process.argv.slice(2);

if (!name) {
  console.error('usage: node scripts/new-maker.mjs "Full Display Name" [TIER]');
  process.exit(1);
}
if (!['S', 'A', 'B', 'C', 'D', 'E'].includes(tier)) {
  console.error(`tier must be one of S A B C D E, got "${tier}"`);
  process.exit(1);
}

const slug = name
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const file = path.join(root, 'src', 'content', 'makers', `${slug}.yaml`);
if (fs.existsSync(file)) {
  console.error(`${file} already exists; refusing to overwrite`);
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const template = `# Maker record. See SPEC.md section 4 for the full contract.
# Replace every PLACEHOLDER line, then run: pnpm validate
name: ${name}
slug: ${slug}
type: individual # individual | duo | atelier | brand
people: ["${name}"] # searchable person names behind the record
tier: ${tier} # S | A | B | C | D | E
# tier_note: knocking on C
# scores: { A: 3, M: 3 } # floats 0..5, or [min, max] ranges e.g. M: [3.5, 4]
status: active # active | dormant | retired
location: PLACEHOLDER # as written in the doc, e.g. "Le Locle, Switzerland"
country: PLACEHOLDER
# founded: 2020
# lineage:
#   - Trained under ...
# movement_making: full_inhouse # full_inhouse | partial | finished_ebauche | vintage_restoration
# production_per_year: [10, 20]
# ordering: { status: open } # open | waitlist | closed, optional years + note
# website: https://example.com
# instagram: barehandle # no @, no URL
price: # fallback summary; keep only when models are unknown
  text: 'PLACEHOLDER e.g. "Model X: CHF 50,000"'
  # amount: 50000
  # currency: USD # USD | CHF | EUR | GBP | JPY | AUD
# models:
#   - name: PLACEHOLDER
#     status: current # current | sold_out | discontinued
#     prices:
#       - { text: stainless steel, amount: 62000, currency: USD }
# awards:
#   - { year: 2026, name: PLACEHOLDER, result: winner }
tags: []
sources: []
last_verified: ${today}
added: ${today}
updated: ${today}
doc_heading: ${name}
body: |
  PLACEHOLDER: one or more body paragraphs (prose, markdown ok).
`;

fs.writeFileSync(file, template);
console.log(`wrote ${path.relative(root, file)}`);
