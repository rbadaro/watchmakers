/**
 * Smoke checks for src/lib/browse.ts (run: pnpm smoke:browse).
 *
 * Hand-built fixtures exercise the deterministic logic (filters, price
 * bands, sorts, URL round-trip). The fuzzy-search checks run against the
 * real built index (dist/search-index.json) when present.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applyFilters,
  createSearcher,
  queryToState,
  runQuery,
  sortRecords,
  stateToQuery,
  DEFAULT_STATE,
} from '../src/lib/browse.ts';

const names = (items) => items.map((r) => r.name);

const fixtures = [
  { slug: 'alpha', name: 'Alpha One', people: [], aliases: [], tier: 'S', country: 'Switzerland', location: 'Geneva', movement_making: 'full_inhouse', orderingStatus: null, a: { min: 5, max: 5 }, m: { min: 4.5, max: 5 }, models: [], priceText: 'from CHF 30,000', priceFromGBP: 28000, awards: [], bodyExcerpt: 'First.', added: '2026-08-29', updated: '2026-08-20' },
  { slug: 'beta', name: 'Beta Two', people: [], aliases: [], tier: 'B', country: 'Japan', location: 'Tokyo', movement_making: 'partial', orderingStatus: null, a: { min: 4, max: 4.5 }, m: { min: 3.5, max: 3.5 }, models: [], priceText: 'from JPY 25,000,000', priceFromGBP: 120000, awards: [], bodyExcerpt: 'Second.', added: '2026-08-29', updated: '2026-08-30' },
  { slug: 'gamma', name: 'Gamma Three', people: [], aliases: [], tier: 'B', country: 'Japan', location: 'Osaka', movement_making: 'partial', orderingStatus: null, models: [], priceText: null, priceFromGBP: null, awards: [], bodyExcerpt: 'Third.', added: '2026-08-29', updated: '2026-08-31' },
  { slug: 'delta', name: 'Delta Four', people: [], aliases: [], tier: 'E', country: 'Canada', location: 'Toronto', movement_making: 'full_inhouse', orderingStatus: null, a: { min: 3.5, max: 4 }, m: { min: 2.5, max: 2.5 }, models: [], priceText: 'from USD 420,000', priceFromGBP: 310000, awards: [], bodyExcerpt: 'Fourth.', added: '2026-08-29', updated: '2026-08-29' },
];
const state = (over = {}) => ({ ...DEFAULT_STATE, ...over });

// (a) tier chip filter
assert.deepEqual(names(applyFilters(fixtures, state()).items), ['Alpha One', 'Beta Two', 'Gamma Three', 'Delta Four']);
assert.deepEqual(names(applyFilters(fixtures, state({ tiers: ['B'] })).items), ['Beta Two', 'Gamma Three']);
assert.deepEqual(names(applyFilters(fixtures, state({ tiers: ['S', 'E'] })).items), ['Alpha One', 'Delta Four']);
console.log('PASS (a) tier chips: no chip = all 4; [B] = Beta,Gamma; [S,E] = Alpha,Delta');

// (b) price bands hide unknown prices, with the correct hidden count
for (const [band, kept, hidden] of [[1, ['Alpha One'], 1], [2, ['Beta Two'], 1], [4, ['Delta Four'], 1]]) {
  const r = applyFilters(fixtures, state({ band }));
  assert.deepEqual(names(r.items), kept);
  assert.equal(r.hiddenNoPrice, hidden);
}
const noBand = applyFilters(fixtures, state({ band: 0 }));
assert.equal(noBand.hiddenNoPrice, 0);
assert.equal(noBand.items.length, 4);
console.log('PASS (b) price bands: <£50k -> Alpha only, £50-150k -> Beta only, £300k+ -> Delta only; 1 unknown-price hidden per band, 0 hidden with band off');

// (b2) country and movement filters AND with the rest
assert.deepEqual(names(applyFilters(fixtures, state({ country: 'Japan' })).items), ['Beta Two', 'Gamma Three']);
assert.deepEqual(names(applyFilters(fixtures, state({ movement: 'full_inhouse' })).items), ['Alpha One', 'Delta Four']);
console.log('PASS (b2) country and full-in-house filters compose');

// (d) price sort keeps unknown prices last in both directions
assert.deepEqual(names(sortRecords(fixtures, 'price_asc')), ['Alpha One', 'Beta Two', 'Delta Four', 'Gamma Three']);
assert.deepEqual(names(sortRecords(fixtures, 'price_desc')), ['Delta Four', 'Beta Two', 'Alpha One', 'Gamma Three']);
assert.deepEqual(names(sortRecords(fixtures, 'default')), ['Alpha One', 'Beta Two', 'Gamma Three', 'Delta Four']);
assert.deepEqual(names(sortRecords(fixtures, 'updated')), ['Gamma Three', 'Beta Two', 'Delta Four', 'Alpha One']);
console.log('PASS (d) sorts: price asc/desc both sort Gamma (no price) last; default = tier then name; updated = newest first');

// (e) state -> query -> parse round-trip
const full = state({ q: 'gröne feld', tiers: ['S', 'B'], country: 'United Kingdom', movement: 'full_inhouse', band: 3, a: 4.5, m: 3.5, sort: 'price_asc' });
assert.deepEqual(queryToState(stateToQuery(full)), full);
assert.equal(stateToQuery(state()), '');
assert.deepEqual(queryToState(''), state());
assert.deepEqual(queryToState('?band=99&sort=bogus&tier=X&a=7&m=bogus'), state()); // junk ignored = defaults
console.log(`PASS (e) URL round-trip: ${stateToQuery(full)} parses back to the same state; defaults and junk collapse to default state`);

// (g) A/M minimum-threshold filters: conservative axis-min matching,
// unknown scores hidden with a per-axis count (M7)
// gamma has no scores at all; delta ranges A [3.5, 4] and M [2.5, 2.5];
// beta ranges A [4, 4.5].
const g1 = applyFilters(fixtures, state({ a: 4 }));
assert.deepEqual(names(g1.items), ['Alpha One', 'Beta Two'], 'A>=4: [4, 4.5] range passes, [3.5, 4] excluded');
assert.equal(g1.hiddenNoScoreA, 1);
assert.equal(g1.hiddenNoScoreM, 0);
const g2 = applyFilters(fixtures, state({ a: 3.5 }));
assert.deepEqual(names(g2.items), ['Alpha One', 'Beta Two', 'Delta Four'], 'A>=3.5: [3.5, 4] range passes at its own minimum');
assert.equal(g2.hiddenNoScoreA, 1);
const g3 = applyFilters(fixtures, state({ m: 4 }));
assert.deepEqual(names(g3.items), ['Alpha One'], 'M>=4: only [4.5, 5] passes; [3.5, 3.5] and [2.5, 2.5] fail');
assert.equal(g3.hiddenNoScoreM, 1);
const g4 = applyFilters(fixtures, state({ m: 2.5 }));
assert.deepEqual(names(g4.items), ['Alpha One', 'Beta Two', 'Delta Four']);
assert.equal(g4.hiddenNoScoreM, 1);
const g5 = runQuery(fixtures, null, state({ a: 4, m: 4 }));
assert.deepEqual(g5.items.map((i) => i.record.name), ['Alpha One']);
assert.equal(g5.hiddenNoScoreA, 1, 'gamma (no scores at all) counts once, at A; counts do not overlap');
assert.equal(g5.hiddenNoScoreM, 0);
assert.equal(g5.searching, false);
console.log('PASS (g) A/M thresholds: axis-min matching ([4,4.5] passes A>=4, [3.5,4] fails it, passes A>=3.5); no-scores maker hidden, counted once per active axis');

// (h) URL keys a/m round-trip through arbitrary URLs
assert.deepEqual(queryToState('?a=4.5&m=2.5'), state({ a: 4.5, m: 2.5 }));
assert.equal(stateToQuery(state({ a: 4, m: 3 })), '?a=4&m=3');
assert.deepEqual(queryToState(stateToQuery(state({ a: 5 }))), state({ a: 5 }));
console.log('PASS (h) URL keys: a/m serialize only off Any and validate against the offered thresholds');

// (f) searching: relevance wins over sort, filters still apply
const fuseFx = createSearcher(fixtures);
const searching = runQuery(fixtures, fuseFx, state({ q: 'Beta', sort: 'price_asc' }));
assert.equal(searching.searching, true);
assert.equal(searching.items[0].record.slug, 'beta');
const narrowed = runQuery(fixtures, fuseFx, state({ q: 'Beta', tiers: ['S'] }));
assert.equal(narrowed.items.length, 0, 'filters narrow even when the fuzzy search would match');
console.log('PASS (f) search ranks within the filtered set; tier filter narrows fuzzy hits');

// (c) fuzzy behaviour on the real built index (needs pnpm build first)
let realPath = null;
for (const p of ['dist/search-index.json', 'dist/watchmakers/search-index.json']) {
  try {
    readFileSync(p);
    realPath = p;
    break;
  } catch {
    /* keep looking */
  }
}
if (!realPath) {
  console.log('SKIP (c) real-index fuzzy checks (no dist/search-index.json; run pnpm build first)');
} else {
  const real = JSON.parse(readFileSync(realPath, 'utf8'));
  const fuse = createSearcher(real);

  const exact = runQuery(real, fuse, state({ q: 'gronefeld' }));
  assert.equal(exact.items[0].record.name, 'Grönefeld', 'diacritic-blind name hit');
  const typo = runQuery(real, fuse, state({ q: 'gronefeldt' }));
  assert.ok(
    typo.items.slice(0, 3).some((i) => i.record.name === 'Grönefeld'),
    'typo "gronefeldt" still surfaces Grönefeld in the top 3',
  );
  const model = runQuery(real, fuse, state({ q: 'ardea' }));
  assert.equal(model.items[0].record.slug, 'bradley-taylor');
  assert.ok(model.items[0].reason?.startsWith('Model:'), `reason line present: ${model.items[0].reason}`);
  const modelInTier = runQuery(real, fuse, state({ q: 'ardea', tiers: ['D'] }));
  assert.equal(modelInTier.items[0].record.slug, 'bradley-taylor', 'model search survives tier filter');
  console.log(`PASS (c) real index (${real.length} records): 'gronefeld' -> Grönefeld top hit, typo 'gronefeldt' top 3, 'ardea' -> Bradley Taylor with "${model.items[0].reason}"`);

  // (c2) A/M score coverage and real A>=4 behaviour on the built index (M7)
  const withA = real.filter((r) => r.a).length;
  const withM = real.filter((r) => r.m).length;
  assert.ok(withA > 0 && withM > 0, 'index carries A and M score ranges');
  for (const r of real) {
    if (r.a) assert.ok(typeof r.a.min === 'number' && typeof r.a.max === 'number' && r.a.min <= r.a.max, `a range shaped on ${r.slug}`);
    if (r.m) assert.ok(typeof r.m.min === 'number' && typeof r.m.max === 'number' && r.m.min <= r.m.max, `m range shaped on ${r.slug}`);
  }
  const passA4 = real.filter((r) => r.a && r.a.min >= 4).length;
  const ra4 = runQuery(real, fuse, state({ a: 4 }));
  assert.equal(ra4.items.length, passA4);
  assert.equal(ra4.hiddenNoScoreA, real.length - withA);
  console.log(`PASS (c2) score coverage: ${real.length} makers, ${withA} with A, ${withM} with M; A>=4 keeps ${passA4} and hides ${real.length - withA} without A scores`);
}

console.log('browse smoke: all checks passed');
