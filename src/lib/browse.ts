/**
 * Pure browse logic for the Movement Map index (SPEC section 6).
 *
 * Everything the BrowseApp island does to the record set is implemented here
 * as framework-free functions over plain data, so the behaviour is smoke
 * runnable from node without a DOM or a build. Only erasable TS syntax is
 * used (node 22 runs this file via type stripping for scripts/smoke-browse).
 */

import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'M' | 'I';
export const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D', 'E', 'M', 'I'];

export type SortId = 'default' | 'name' | 'price_asc' | 'price_desc' | 'updated';
export type MovementFilter = 'any' | 'full_inhouse';
export type PriceBand = 0 | 1 | 2 | 3 | 4;

/** One record of src/pages/search-index.json.ts. */
export interface BrowseRecord {
  slug: string;
  name: string;
  people: string[];
  aliases: string[];
  tier: Tier;
  country: string;
  location: string;
  movement_making: string;
  orderingStatus: 'open' | 'waitlist' | 'closed' | null;
  models: string[];
  priceText: string | null;
  priceFromGBP: number | null;
  awards: string[];
  bodyExcerpt: string;
  added: string;
  updated: string;
}

export interface BrowseState {
  q: string;
  tiers: Tier[]; // empty = all tiers
  country: string; // '' = all countries
  movement: MovementFilter;
  band: PriceBand; // 0 = any price
  sort: SortId;
}

export const DEFAULT_STATE: BrowseState = {
  q: '',
  tiers: [],
  country: '',
  movement: 'any',
  band: 0,
  sort: 'default',
};

export const BANDS: { id: PriceBand; label: string; min: number | null; max: number | null }[] = [
  { id: 0, label: 'Any price', min: null, max: null },
  { id: 1, label: 'Under £50k', min: 0, max: 50000 },
  { id: 2, label: '£50k-£150k', min: 50000, max: 150000 },
  { id: 3, label: '£150k-£300k', min: 150000, max: 300000 },
  { id: 4, label: '£300k+', min: 300000, max: null },
];

export const SORTS: { id: SortId; label: string }[] = [
  { id: 'default', label: 'Default (Tier, name)' },
  { id: 'name', label: 'Name A-Z' },
  { id: 'price_asc', label: 'Price low-high' },
  { id: 'price_desc', label: 'Price high-low' },
  { id: 'updated', label: 'Recently updated' },
];

/* ------------------------------ filtering ------------------------------ */

export interface FilterResult {
  items: BrowseRecord[];
  /** Records excluded only because an active price band hides unknown prices. */
  hiddenNoPrice: number;
}

/** All filters AND-combine (SPEC 6.3). */
export function applyFilters(records: BrowseRecord[], state: BrowseState): FilterResult {
  const band = BANDS.find((b) => b.id === state.band) ?? BANDS[0];
  let hiddenNoPrice = 0;
  const items = records.filter((m) => {
    if (state.tiers.length > 0 && !state.tiers.includes(m.tier)) return false;
    if (state.country !== '' && m.country !== state.country) return false;
    if (state.movement === 'full_inhouse' && m.movement_making !== 'full_inhouse') return false;
    if (band.id !== 0) {
      if (m.priceFromGBP == null) {
        hiddenNoPrice += 1;
        return false;
      }
      if (band.min != null && m.priceFromGBP < band.min) return false;
      if (band.max != null && m.priceFromGBP >= band.max) return false;
    }
    return true;
  });
  return { items, hiddenNoPrice };
}

/* ------------------------------- sorting ------------------------------- */

function tierRank(tier: Tier): number {
  const rank = TIERS.indexOf(tier);
  return rank === -1 ? TIERS.length : rank;
}

function byName(a: BrowseRecord, b: BrowseRecord): number {
  return a.name.localeCompare(b.name, 'en');
}

/** Price comparator that keeps unknown prices last in both directions. */
function byPrice(dir: 1 | -1) {
  return (a: BrowseRecord, b: BrowseRecord): number => {
    const pa = a.priceFromGBP;
    const pb = b.priceFromGBP;
    if (pa == null && pb == null) return byName(a, b);
    if (pa == null) return 1;
    if (pb == null) return -1;
    const delta = (pa - pb) * dir;
    return delta === 0 ? byName(a, b) : delta;
  };
}

export function sortRecords(items: BrowseRecord[], sort: SortId): BrowseRecord[] {
  const arr = [...items];
  switch (sort) {
    case 'name':
      return arr.sort(byName);
    case 'price_asc':
      return arr.sort(byPrice(1));
    case 'price_desc':
      return arr.sort(byPrice(-1));
    case 'updated':
      return arr.sort((a, b) => b.updated.localeCompare(a.updated) || byName(a, b));
    default:
      return arr.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || byName(a, b));
  }
}

/* ------------------------------- search -------------------------------- */

/** Fuse keys and weights verbatim from SPEC section 6. */
export const FUSE_OPTIONS: IFuseOptions<BrowseRecord> = {
  keys: [
    { name: 'name', weight: 0.4 },
    { name: 'aliases', weight: 0.15 },
    { name: 'people', weight: 0.15 },
    { name: 'models', weight: 0.15 },
    { name: 'awards', weight: 0.15 },
    { name: 'bodyExcerpt', weight: 0.1 },
    { name: 'location', weight: 0.05 },
    { name: 'country', weight: 0.05 },
  ],
  threshold: 0.3,
  ignoreLocation: true,
  includeMatches: true,
  minMatchCharLength: 2,
};

export function createSearcher(records: BrowseRecord[]): Fuse<BrowseRecord> {
  return new Fuse(records, FUSE_OPTIONS);
}

export interface SearchMatch {
  key?: string;
  value?: string;
  indices: [number, number][];
}

/** Human-readable reason for a non-name hit, e.g. "Model: Ardea". */
export function matchReason(matches: readonly SearchMatch[]): string | null {
  const labels: Record<string, string> = {
    models: 'Model',
    awards: 'Award',
    location: 'Location',
    country: 'Country',
    people: 'Person',
    aliases: 'Also known as',
    bodyExcerpt: 'Notes',
  };
  for (const m of matches) {
    const label = m.key != null ? labels[m.key] : undefined;
    if (label && m.value) return `${label}: ${m.value}`;
  }
  return null;
}

export interface Segment {
  text: string;
  mark: boolean;
}

/** Name split into marked/unmarked segments from a Fuse match's indices. */
export function nameSegments(name: string, matches: readonly SearchMatch[] | undefined): Segment[] {
  const nameMatch = (matches ?? []).find((m) => m.key === 'name');
  if (!nameMatch || nameMatch.indices.length === 0) return [{ text: name, mark: false }];
  const merged: [number, number][] = [];
  const sorted = [...nameMatch.indices].sort((x, y) => x[0] - y[0]);
  for (const [s, e] of sorted) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const segments: Segment[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) segments.push({ text: name.slice(pos, s), mark: false });
    segments.push({ text: name.slice(s, e + 1), mark: true });
    pos = e + 1;
  }
  if (pos < name.length) segments.push({ text: name.slice(pos), mark: false });
  return segments;
}

export interface QueryItem {
  record: BrowseRecord;
  reason: string | null;
  segments: Segment[];
}

export interface QueryResult {
  items: QueryItem[];
  hiddenNoPrice: number;
  searching: boolean;
}

/**
 * The full browse query: filter narrows the set, then either Fuse ranks
 * within it (search text present; sort is irrelevant) or the chosen sort
 * orders it (SPEC sections 6.3-6.5).
 */
export function runQuery(
  records: BrowseRecord[],
  fuse: Fuse<BrowseRecord> | null,
  state: BrowseState,
): QueryResult {
  const { items: filtered, hiddenNoPrice } = applyFilters(records, state);
  const q = state.q.trim();
  if (q === '' || fuse == null) {
    return {
      items: sortRecords(filtered, state.sort).map((record) => ({
        record,
        reason: null,
        segments: [{ text: record.name, mark: false }],
      })),
      hiddenNoPrice,
      searching: false,
    };
  }
  const keep = new Set(filtered.map((m) => m.slug));
  const items = fuse
    .search(q)
    .filter((hit) => keep.has(hit.item.slug))
    .map((hit) => ({
      record: hit.item,
      reason: matchReason((hit.matches ?? []) as SearchMatch[]),
      segments: nameSegments(hit.item.name, (hit.matches ?? []) as SearchMatch[]),
    }));
  return { items, hiddenNoPrice, searching: true };
}

/* ------------------------------ URL state ------------------------------ */

/**
 * Mirror of the browse state in the query string (SPEC 6.6):
 * ?q=&tier=&country=&movement=&band=&sort= — any parameter at its default
 * is omitted, so every combination is a shareable link.
 */
export function stateToQuery(state: BrowseState): string {
  const p = new URLSearchParams();
  const q = state.q.trim();
  if (q !== '') p.set('q', q);
  if (state.tiers.length > 0) p.set('tier', state.tiers.join(','));
  if (state.country !== '') p.set('country', state.country);
  if (state.movement !== 'any') p.set('movement', state.movement);
  if (state.band !== 0) p.set('band', String(state.band));
  if (state.sort !== 'default') p.set('sort', state.sort);
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

export function queryToState(search: string): BrowseState {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const tiers = (p.get('tier') ?? '')
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t): t is Tier => (TIERS as string[]).includes(t));
  const movement: MovementFilter = p.get('movement') === 'full_inhouse' ? 'full_inhouse' : 'any';
  const bandNum = Number(p.get('band'));
  const band: PriceBand = ([0, 1, 2, 3, 4] as PriceBand[]).includes(bandNum as PriceBand)
    ? (bandNum as PriceBand)
    : 0;
  const sortIds = SORTS.map((s) => s.id) as string[];
  const sortParam = p.get('sort') ?? '';
  const sort: SortId = sortIds.includes(sortParam) ? (sortParam as SortId) : 'default';
  return { q: p.get('q') ?? '', tiers, country: p.get('country') ?? '', movement, band, sort };
}
