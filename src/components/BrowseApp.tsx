/**
 * BrowseApp: the single interactive island of the site (SPEC sections 5-6).
 * Search input, compact select grid (tier, country, authorship/manufacture
 * minimums, movement making, price band), sort select, live counts, and the
 * maker card grid. All behaviour lives in src/lib/browse.ts; this file is
 * rendering and wiring only.
 */

import { Fragment } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  A_THRESHOLDS,
  BANDS,
  DEFAULT_STATE,
  M_THRESHOLDS,
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
  M: 'bg-tier-m-bg text-tier-m-text',
  I: 'bg-tier-i-bg text-tier-i-text',
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

/* Compact filter grid (M8): tier, price band and in-house are native
   selects, sharing the same control language as the other filters. All
   controls keep the same state keys and URL params as the old pills. */

function hiddenPriceNote(n: number): string {
  return `${n} ${n === 1 ? 'maker' : 'makers'} without public ${
    n === 1 ? 'price is' : 'prices are'
  } hidden by this filter`;
}

function hiddenScoreNote(n: number, axis: 'authorship' | 'manufacture'): string {
  return `${n} ${n === 1 ? 'maker' : 'makers'} without ${axis} ${
    n === 1 ? 'score is' : 'scores are'
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
  const toggleTier = (tier: Tier | '') =>
    update({ tiers: tier === '' ? [] : [tier] });
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

      {/* Compact filter grid (M8): mobile 2 columns, desktop 4. Every
          select shares the same control language; tier counts ride in the
          option labels. A legacy multi-tier URL (?tier=S,A) keeps filtering
          on all its tiers and shows the first in the select until changed. */}
      <div class="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-4">
        <span class="flex items-center gap-1.5 text-sm text-ink-dim">
          Tier
          <select
            aria-label="Filter by tier"
            value={state.tiers[0] ?? ''}
            onChange={(e) => toggleTier(e.currentTarget.value as Tier | '')}
            class={`${controlClass} min-w-0 flex-1`}
          >
            <option value="">All tiers</option>
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                Tier {tier} ({tierCounts.get(tier) ?? 0})
              </option>
            ))}
          </select>
        </span>
        <span class="flex items-center gap-1.5 text-sm text-ink-dim">
          Country
          <select
            aria-label="Filter by country"
            value={state.country}
            onChange={(e) => update({ country: e.currentTarget.value })}
            class={`${controlClass} min-w-0 flex-1`}
          >
            <option value="">All countries</option>
            {countries.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </span>
        {/* Score-threshold selects (M7): match on the axis minimum, stay
            enabled during search like every other filter, and hide unscored
            records with the count note shown below the filter bar. */}
        <span class="flex items-center gap-1.5 text-sm text-ink-dim">
          Authorship
          <select
            aria-label="Minimum authorship score"
            value={state.a == null ? '' : String(state.a)}
            onChange={(e) =>
              update({ a: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })
            }
            class={`${controlClass} min-w-0 flex-1`}
          >
            <option value="">Any</option>
            {A_THRESHOLDS.map((t) => (
              <option key={t} value={String(t)}>{`≥ ${t}`}</option>
            ))}
          </select>
        </span>
        <span class="flex items-center gap-1.5 text-sm text-ink-dim">
          Manufacture
          <select
            aria-label="Minimum manufacture score"
            value={state.m == null ? '' : String(state.m)}
            onChange={(e) =>
              update({ m: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) })
            }
            class={`${controlClass} min-w-0 flex-1`}
          >
            <option value="">Any</option>
            {M_THRESHOLDS.map((t) => (
              <option key={t} value={String(t)}>{`≥ ${t}`}</option>
            ))}
          </select>
        </span>
        <span class="flex items-center gap-1.5 text-sm text-ink-dim">
          Movement
          <select
            aria-label="Filter by movement making"
            value={state.movement}
            onChange={(e) => update({ movement: e.currentTarget.value as MovementFilter })}
            class={`${controlClass} min-w-0 flex-1`}
          >
            <option value="any">All</option>
            <option value="full_inhouse">Full in-house</option>
          </select>
        </span>
        <span class="flex items-center gap-1.5 text-sm text-ink-dim">
          Price
          <select
            aria-label="Filter by price band"
            value={String(state.band)}
            onChange={(e) => update({ band: Number(e.currentTarget.value) as PriceBand })}
            class={`${controlClass} min-w-0 flex-1`}
          >
            {BANDS.map((band) => (
              <option key={band.id} value={String(band.id)}>
                {band.label}
              </option>
            ))}
          </select>
        </span>
      </div>

      {/* Keeps heading order valid: the filter bar contains no heading, the
          grid needs an h2 before the h3 card titles. Visually hidden; screen
          readers and the outline get a proper section. */}
      <h2 class="sr-only">Makers</h2>

      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p class="text-sm text-ink-dim" role="status" aria-live="polite">
          Showing {result.items.length} of {records.length} makers
        </p>
        {state.band !== 0 && result.hiddenNoPrice > 0 && (
          <p class="text-xs text-ink-dim">{hiddenPriceNote(result.hiddenNoPrice)}</p>
        )}
        {state.a != null && result.hiddenNoScoreA > 0 && (
          <p class="text-xs text-ink-dim">{hiddenScoreNote(result.hiddenNoScoreA, 'authorship')}</p>
        )}
        {state.m != null && result.hiddenNoScoreM > 0 && (
          <p class="text-xs text-ink-dim">{hiddenScoreNote(result.hiddenNoScoreM, 'manufacture')}</p>
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
