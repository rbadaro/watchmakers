/**
 * Display formatting helpers shared by pages, endpoints, and the island.
 */

/**
 * First display sentence of a Markdown body, for card excerpts. Strips list
 * markers, links, and inline emphasis, stops at the first sentence end, and
 * clamps to `max` chars.
 */
export function firstSentence(markdown: string, max = 160): string {
  const firstPara =
    markdown.split(/\n\s*\n/).find((p) => p.trim().length > 0) ?? markdown;
  const plain = firstPara
    .replace(/^\s*[-*+#]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = plain.match(/^(.+?[.!?])(\s|$)/);
  let sentence = match ? match[1] : plain;
  if (sentence.length > max) {
    sentence = `${sentence.slice(0, max - 1).trimEnd()}…`;
  }
  return sentence;
}

/* ------------------------------------------------------------------ */
/* Detail-page formatters (SPEC section 5, maker page)                 */
/* ------------------------------------------------------------------ */

/** An A or M score value: a single number or a [min, max] range. */
export type ScoreValue = number | [number, number];

/** "3" / "4.5" for a single score, "3.5-4" for a range. */
export function formatScore(score: ScoreValue): string {
  if (Array.isArray(score)) {
    return `${formatScoreNumber(score[0])}-${formatScoreNumber(score[1])}`;
  }
  return formatScoreNumber(score);
}

function formatScoreNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

export const MOVEMENT_LABELS: Record<string, string> = {
  full_inhouse: 'Full in-house',
  partial: 'Partial',
  finished_ebauche: 'Finished ebauche',
  vintage_restoration: 'Vintage restoration',
};

export function movementLabel(key: string | undefined): string | null {
  if (!key) return null;
  return MOVEMENT_LABELS[key] ?? key;
}

export const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  dormant: 'Dormant',
  retired: 'Retired',
};

export const ORDERING_LABELS: Record<string, string> = {
  open: 'Books open',
  waitlist: 'Waitlist',
  closed: 'Books closed',
};

export const MODEL_STATUS_LABELS: Record<string, string> = {
  current: 'Current',
  sold_out: 'Sold out',
  discontinued: 'Discontinued',
};

export interface YearsLike {
  introduced?: number;
  until?: number;
}

/** "2024" when only introduced, "2021-2023" for a closed run. */
export function yearsLabel(years: YearsLike | undefined): string {
  if (!years) return '';
  const { introduced, until } = years;
  if (introduced != null && until != null) return `${introduced}-${until}`;
  if (introduced != null) return `${introduced}`;
  if (until != null) return `until ${until}`;
  return '';
}

export interface ProductionLike {
  series_total?: number;
  per_year?: number;
  note?: string;
}

/** "series of 50", "~4/year", note appended after a middle dot. */
export function productionLabel(production: ProductionLike | undefined): string {
  if (!production) return '';
  const parts: string[] = [];
  if (production.series_total != null) {
    parts.push(`series of ${production.series_total}`);
  }
  if (production.per_year != null) {
    parts.push(`~${production.per_year}/year`);
  }
  if (production.note) {
    parts.push(production.note);
  }
  return parts.join(' · ');
}

export interface PriceVariantLike {
  text?: string;
  amount?: number;
  currency?: string;
}

/** One variant: "USD 62,000 stainless steel"; unknown amount shows text or a note. */
export function priceVariantLabel(variant: PriceVariantLike): string {
  if (variant.amount != null && variant.currency) {
    const amount = `${variant.currency} ${Math.round(variant.amount).toLocaleString('en-GB')}`;
    return variant.text ? `${amount} ${variant.text}` : amount;
  }
  return variant.text ?? 'Price not published';
}

/** All variants of a model joined: "USD 62,000 steel; USD 82,500 platinum". */
export function pricesLabel(variants: PriceVariantLike[] | undefined): string {
  if (!variants || variants.length === 0) return '';
  return variants.map(priceVariantLabel).join('; ');
}
