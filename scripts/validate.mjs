#!/usr/bin/env node
/**
 * Validator for the makers data layer (SPEC section 8, step 3).
 *
 * Checks every src/content/makers/*.yaml file against the shared schema:
 *   - YAML parses
 *   - schema parse passes (same zod definition as the Astro build)
 *   - no unknown keys (zod strips silently; we want typos caught)
 *   - slug matches filename, slugs and names are unique
 *   - ordering-status sanity: ordering.status presence is schema-enforced
 *   - warns (does not fail) when a record has neither models nor price
 *
 * Prints a gap report (records missing website and/or instagram) and exits
 * 0 when the data is buildable, 1 when any record fails a hard check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import { z } from 'zod';
import { makeMakerSchema } from '../src/content/makerSchema.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'src', 'content', 'makers');
const schema = makeMakerSchema(z);

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  .sort();

if (files.length === 0) {
  console.error('No maker YAML files found in src/content/makers');
  process.exit(1);
}

let failures = 0;
const slugs = new Map();
const names = new Map();
const noPrice = [];
const missingWeb = [];
const missingIg = [];
const stats = { models: 0, fallback: 0, none: 0 };

for (const file of files) {
  const fp = path.join(dir, file);
  let data;
  try {
    data = yamlLoad(fs.readFileSync(fp, 'utf8'));
  } catch (err) {
    console.error(`FAIL ${file}: YAML parse error: ${err.message}`);
    failures++;
    continue;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    console.error(`FAIL ${file}: top level must be a mapping`);
    failures++;
    continue;
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      console.error(`FAIL ${file}: ${issue.path.join('.')}: ${issue.message}`);
    }
    failures++;
    continue;
  }

  // Unknown-key detection (zod strips them silently; we flag instead).
  const allowed = new Set(Object.keys(schema.shape));
  for (const key of Object.keys(data)) {
    if (!allowed.has(key)) console.error(`FAIL ${file}: unknown key "${key}"`), failures++;
  }

  const expectedFile = `${data.slug}.yaml`;
  if (file !== expectedFile) {
    console.error(`FAIL ${file}: filename does not match slug "${data.slug}"`);
    failures++;
  }
  if (slugs.has(data.slug)) {
    console.error(`FAIL ${file}: duplicate slug also used by ${slugs.get(data.slug)}`);
    failures++;
  }
  if (names.has(data.name)) {
    console.error(`FAIL ${file}: duplicate name also used by ${names.get(data.name)}`);
    failures++;
  }
  slugs.set(data.slug, file);
  names.set(data.name, file);

  const hasModels = Array.isArray(data.models) && data.models.length > 0;
  const hasPrice = data.price && data.price.text;
  if (hasModels) stats.models++;
  else if (hasPrice) stats.fallback++;
  else {
    stats.none++;
    noPrice.push(data.name);
    console.error(`WARN ${file}: neither models nor price fallback`);
  }
  if (!data.website) missingWeb.push(data.name);
  if (!data.instagram) missingIg.push(data.name);
}

console.log(
  `\n${files.length} records checked. ` +
    `structured models: ${stats.models}, price fallback: ${stats.fallback}, no price: ${stats.none}`
);
if (noPrice.length) console.log(`  no price at all: ${noPrice.join('; ')}`);
console.log('\nGAP REPORT (warnings only, never failures)');
console.log(`  missing website (${missingWeb.length}): ${missingWeb.join('; ') || 'none'}`);
console.log(`  missing instagram (${missingIg.length}): ${missingIg.join('; ') || 'none'}`);

if (failures > 0) {
  console.error(`\n${failures} hard failure(s).`);
  process.exit(1);
}
console.log('\nvalidate: OK');
