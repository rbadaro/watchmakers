/**
 * Price derivation (SPEC sections 4 and 6).
 *
 * priceFromGBP: min amount across models with status current, converted to
 * GBP via the dated FX snapshot; else the maker-level price fallback amount
 * converted; else null. Used ONLY for sorting and price bands. The display
 * "from" line always shows the original currency and amount.
 */

export interface FxSnapshot {
  date: string;
  base: 'GBP';
  units_per_gbp: Record<string, number>;
  approximate: boolean;
  source: string;
}

export interface PriceLike {
  text?: string;
  amount?: number;
  currency?: string;
}

export interface ModelLike {
  name: string;
  status?: 'current' | 'sold_out' | 'discontinued';
  prices?: PriceLike[];
}

export interface MakerPriceShape {
  price?: PriceLike;
  models?: ModelLike[];
}

export function toGBP(amount: number, currency: string, fx: FxSnapshot): number | null {
  const rate = fx.units_per_gbp[currency];
  if (rate == null || rate <= 0) return null;
  return amount / rate;
}

/** Convert every relevant price to GBP so mixed currencies share one scale. */
export function priceFromGBP(maker: MakerPriceShape, fx: FxSnapshot): number | null {
  let best: number | null = null;
  for (const model of maker.models ?? []) {
    if (model.status !== 'current') continue;
    for (const price of model.prices ?? []) {
      if (price.amount == null || !price.currency) continue;
      const gbp = toGBP(price.amount, price.currency, fx);
      if (gbp != null && (best == null || gbp < best)) best = gbp;
    }
  }
  if (best != null) return best;
  const fallback = maker.price;
  if (fallback?.amount != null && fallback.currency) {
    return toGBP(fallback.amount, fallback.currency, fx);
  }
  return null;
}

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${Math.round(amount).toLocaleString('en-GB')}`;
}

/**
 * The card "from" line. Among all prices of models with status current, the
 * cheapest in GBP terms wins and is shown in its ORIGINAL currency ("from
 * USD 62,000"). With no model prices, the maker-level price.text summary is
 * echoed verbatim. Returns null when there is no price information at all.
 */
export function fromLine(maker: MakerPriceShape, fx: FxSnapshot): string | null {
  let best: PriceLike | null = null;
  let bestGBP = Infinity;
  for (const model of maker.models ?? []) {
    if (model.status !== 'current') continue;
    for (const price of model.prices ?? []) {
      if (price.amount == null || !price.currency) continue;
      const gbp = toGBP(price.amount, price.currency, fx) ?? Infinity;
      if (gbp < bestGBP) {
        bestGBP = gbp;
        best = price;
      }
    }
  }
  if (best?.amount != null && best.currency) {
    return `from ${formatAmount(best.amount, best.currency)}`;
  }
  return maker.price?.text ?? null;
}
