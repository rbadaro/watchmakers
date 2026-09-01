/**
 * BrowseApp: the single interactive island of the site (SPEC sections 5-6).
 * Search input, tier chips, country dropdown, in-house toggle, price band
 * chips, sort select, live counts, and the maker card grid. All behaviour
 * lives in src/lib/browse.ts; this file is rendering and wiring only.
 */

import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  BANDS,
  DEFAULT_STATE,
  SORTS,
  TIERS,
  applyFilters,
  createSearcher,
  queryToState,
  runQuery,
  stateToQuery,
} from '../lib/browse';
import type {
  BrowseRecord,
  BrowseState,
  MovementFilter,
  PriceBand,
  QueryItem,
  SortId,
  Tier,
} from '../lib/browse';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

const TIER_CLASSES: Record<Tier, string> = {
  S: 'bg-tier-s-bg text-tier-s-text',
  A: 'bg-tier-a-bg text-tier-a-text',
  B: 'bg-tier-b-bg text-tier-b-text',
  C: 'bg-tier-c-bg text-tier-c-text',
  D: 'bg-tier-d-bg text-tier-d-text',
  E: 'bg-tier-e-bg text-tier-e-text',
};

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_CLASSES[tier]}`}
    >
      Tier {tier}
    </span>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      class={`rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active
          ? 'border-accent bg-accent text-white'
          : 'border-hairline bg-surface text-ink-dim hover:border-ink-faint/40 hover:text-ink'
      }`}
    >
      {label}
    </button>
  );
}

function hiddenPriceNote(n: number): string {
  return `${n} ${n === 1 ? 'maker' : 'makers'} without public ${
    n === 1 ? 'price is' : 'prices are'
  } hidden by this filter`;
}

function MakerCard({ item }: { item: QueryItem }) {
  const m = item.record;
  return (
    <a
      href={`${BASE}makers/${m.slug}/`}
      class="group flex flex-col rounded-card-lg border border-hairline bg-surface p-5 shadow-card transition-[translate,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:hover:-translate-y-0.5 hover:shadow-md"
    >
      <div class="flex items-center justify-between gap-2">
        <TierBadge tier={m.tier} />
        {m.orderingStatus === 'open' && (
          <span class="rounded-full bg-tier-c-bg px-2.5 py-0.5 text-xs font-medium text-tier-c-text">
            Books open
          </span>
        )}
        {m.orderingStatus === 'waitlist' && (
          <span class="rounded-full bg-tier-d-bg px-2.5 py-0.5 text-xs font-medium text-tier-d-text">
            Waitlist
          </span>
        )}
      </div>
      <h3 class="mt-3 text-base font-semibold text-ink group-hover:text-accent">
        {item.segments.map((s, i) =>
          s.mark ? (
            <mark key={i} class="rounded-sm bg-yellow-100 px-0.5 text-ink">
              {s.text}
            </mark>
          ) : (
            <Fragment key={i}>{s.text}</Fragment>
          ),
        )}
      </h3>
      {(m.location || m.country) !== '' && (
        <p class="mt-1 text-sm text-ink-dim">{m.location !== '' ? m.location : m.country}</p>
      )}
      {/* Some fallback price texts are long provenance notes (Tier S canon
          makers); clamp to one line, full text on hover via title. */}
      <p class="mt-1 text-sm text-ink numerals line-clamp-1" title={m.priceText ?? undefined}>
        {m.priceText ?? 'Price on request'}
      </p>
      {m.bodyExcerpt !== '' && (
        <p class="mt-2 text-sm leading-relaxed text-ink-dim line-clamp-2">{m.bodyExcerpt}</p>
      )}
      {item.reason != null && <p class="mt-2 text-xs text-ink-faint">Match: {item.reason}</p>}
    </a>
  );
}

export default function BrowseApp() {
  const [records, setRecords] = useState<BrowseRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Initial state comes from the URL, so shared links and returning from a
  // detail page both land on the filtered view they came from (SPEC 6.6).
  const [state, setState] = useState<BrowseState>(() =>
    typeof window === 'undefined' ? DEFAULT_STATE : queryToState(window.location.search),
  );

  // URL mirroring: typing replaces the current entry (no history spam),
  // discrete control changes push one, popstate restores the full state.
  const pushAction = useRef(true);
  const mountedRef = useRef(false);

  useEffect(() => {
    const onPop = () => setState(queryToState(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const qs = stateToQuery(state);
    if (window.location.search !== qs) {
      const method = pushAction.current ? 'pushState' : 'replaceState';
      window.history[method](null, '', `${BASE}${qs}`);
    }
  }, [state]);

  // The index is fetched once (tiny: ~60 KB at 112 records) so the grid can
  // render without waiting for a search focus.
  useEffect(() => {
    let alive = true;
    fetch(`${BASE}search-index.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`index ${r.status}`);
        return r.json();
      })
      .then((data: BrowseRecord[]) => {
        if (alive) setRecords(data);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const searcher = useMemo(() => (records ? createSearcher(records) : null), [records]);
  const result = useMemo(
    () => (records ? runQuery(records, searcher, state) : null),
    [records, searcher, state],
  );

  // Chip counts ignore the tier selection itself so every chip always shows
  // how many makers it would surface (APP store style availability counts).
  const tierCounts = useMemo(() => {
    if (!records) return new Map<Tier, number>();
    const { items } = applyFilters(records, { ...state, tiers: [] });
    const map = new Map<Tier, number>();
    for (const m of items) map.set(m.tier, (map.get(m.tier) ?? 0) + 1);
    return map;
  }, [records, state]);

  const countries = useMemo(() => {
    if (!records) return [];
    return [...new Set(records.map((r) => r.country).filter((c) => c !== ''))].sort((a, b) =>
      a.localeCompare(b, 'en'),
    );
  }, [records]);

  const update = (partial: Partial<BrowseState>, push = true) => {
    pushAction.current = push;
    setState((s) => ({ ...s, ...partial }));
  };
  const toggleTier = (tier: Tier) => {
    pushAction.current = true;
    setState((s) => ({
      ...s,
      tiers: s.tiers.includes(tier) ? s.tiers.filter((t) => t !== tier) : [...s.tiers, tier],
    }));
  };
  const clearAll = () => {
    pushAction.current = true;
    setState(DEFAULT_STATE);
  };

  const controlClass =
    'rounded-full border border-hairline bg-surface px-3 py-1.5 text-sm text-ink-dim transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50';

  if (loadError) {
    return (
      <div class="rounded-card border border-hairline bg-surface p-10 text-center text-ink-dim shadow-card">
        <p>The maker index could not be loaded. Refresh the page to try again.</p>
      </div>
    );
  }
  if (!records || !result) {
    return (
      <div
        class="rounded-card border border-hairline bg-surface p-10 text-center text-ink-dim shadow-card"
        aria-busy="true"
      >
        <p>Loading the index...</p>
      </div>
    );
  }

  const searching = result.searching;

  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          aria-label="Search makers"
          placeholder="Search makers, models, places..."
          value={state.q}
          onInput={(e) => update({ q: e.currentTarget.value }, false)}
          class="w-full max-w-md rounded-full border border-hairline bg-surface px-4 py-2 text-sm text-ink shadow-card transition-colors placeholder:text-ink-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div class="flex items-center gap-2">
          {searching && (
            <span class="text-xs text-ink-dim" id="sort-note">
              Sort follows search relevance
            </span>
          )}
          <select
            aria-label="Sort makers"
            aria-describedby={searching ? 'sort-note' : undefined}
            value={state.sort}
            disabled={searching}
            onChange={(e) => update({ sort: e.currentTarget.value as SortId })}
            class={controlClass}
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by tier">
        <Chip active={state.tiers.length === 0} onClick={() => update({ tiers: [] })} label="All" />
        {TIERS.map((tier) => (
          <Chip
            key={tier}
            active={state.tiers.includes(tier)}
            onClick={() => toggleTier(tier)}
            label={`${tier} · ${tierCounts.get(tier) ?? 0}`}
          />
        ))}
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by country"
          value={state.country}
          onChange={(e) => update({ country: e.currentTarget.value })}
          class={controlClass}
        >
          <option value="">All countries</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
        <Chip
          active={state.movement === 'full_inhouse'}
          onClick={() =>
            update({
              movement: (state.movement === 'full_inhouse' ? 'any' : 'full_inhouse') as MovementFilter,
            })
          }
          label="Full in-house"
        />
        <span class="mx-1 hidden h-5 w-px bg-hairline sm:block" aria-hidden="true" />
        <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by price band">
          {BANDS.map((band) => (
            <Chip
              key={band.id}
              active={state.band === band.id}
              onClick={() => update({ band: band.id as PriceBand })}
              label={band.label}
            />
          ))}
        </div>
      </div>

      {/* Keeps heading order valid around the h1 (Lighthouse heading-order):
          the filter bar contains no heading, the grid needs an h2 before the
          h3 card titles. Visually hidden; screen readers and the outline get
          a proper section. */}
      <h2 class="sr-only">Makers</h2>

      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p class="text-sm text-ink-dim" role="status" aria-live="polite">
          Showing {result.items.length} of {records.length} makers
        </p>
        {state.band !== 0 && result.hiddenNoPrice > 0 && (
          <p class="text-xs text-ink-dim">{hiddenPriceNote(result.hiddenNoPrice)}</p>
        )}
      </div>

      {result.items.length === 0 ? (
        <div class="rounded-card border border-hairline bg-surface p-10 text-center shadow-card">
          <p class="text-ink">No makers match.</p>
          <button
            type="button"
            onClick={clearAll}
            class="mt-3 text-sm text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
          >
            Clear all
          </button>
        </div>
      ) : (
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((item) => (
            <MakerCard key={item.record.slug} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
