/**
 * Maker schema v2: the single source of truth for the data contract
 * (SPEC.md section 4). Implemented as a factory taking a zod instance so
 * that both Astro's content layer (astro:content `z`) and the standalone
 * validator (scripts/validate.mjs, `zod` package) share one definition.
 *
 * Only zod-v3/v4-compatible API surface is used here.
 */
export function makeMakerSchema(z) {
  const scoreValue = z.union([
    z.number().min(0).max(5),
    z.tuple([z.number().min(0).max(5), z.number().min(0).max(5)]),
  ]);

  // YAML parses bare `2026-08-29` into a Date; accept both and normalize
  // to an ISO string so downstream code always sees YYYY-MM-DD.
  const isoDate = z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected ISO date YYYY-MM-DD'),
    z.date().transform((d) => d.toISOString().slice(0, 10)),
  ]);

  const currency = z.enum(['USD', 'CHF', 'EUR', 'GBP', 'JPY', 'AUD', 'HKD']);

  const priceVariant = z
    .object({
      text: z.string().optional(),
      amount: z.number().positive().optional(),
      currency: currency.optional(),
    })
    .refine((o) => (o.amount == null) === (o.currency == null), {
      message: 'amount and currency must come together',
    });

  const model = z.object({
    name: z.string().min(1),
    calibre: z.string().optional(),
    years: z
      .object({
        introduced: z.number().int().min(1800).max(2100).optional(),
        until: z.number().int().min(1800).max(2100).optional(),
      })
      .optional(),
    production: z
      .object({
        series_total: z.number().int().positive().optional(),
        per_year: z.number().positive().optional(),
        note: z.string().optional(),
      })
      .optional(),
    status: z.enum(['current', 'sold_out', 'discontinued']),
    prices: z.array(priceVariant).optional(),
  });

  const award = z.object({
    year: z.number().int().min(1900).max(2100).optional(),
    name: z.string().min(1),
    result: z.string().optional(),
    models: z.array(z.string()).optional(),
  });

  return z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case slug'),
    type: z.enum(['individual', 'duo', 'atelier', 'brand']),
    people: z.array(z.string().min(1)).min(1).optional(),
    aliases: z.array(z.string().min(1)).optional(),
    // S-E from the doc's tier ladder; M and I come from the two untiered H1
    // sections below the ladder ("Independent manufactures worth knowing" and
    // "Important independents that fit the movement-first thesis less cleanly").
    tier: z.enum(['S', 'A', 'B', 'C', 'D', 'E', 'M', 'I']),
    tier_note: z.string().optional(),
    scores: z
      .object({
        A: scoreValue.optional(),
        M: scoreValue.optional(),
      })
      .optional(),
    status: z.enum(['active', 'dormant', 'retired']),
    // Optional: the source document leaves location unscored/undocumented for
    // some established Tier S canon brands (Ming, Ressence, Czapek, ...).
    location: z.string().min(1).optional(),
    country: z.string().min(1).optional(),
    founded: z.number().int().min(1800).max(2100).optional(),
    lineage: z.array(z.string().min(1)).optional(),
    movement_making: z
      .enum(['full_inhouse', 'partial', 'finished_ebauche', 'vintage_restoration'])
      .optional(),
    production_per_year: z
      .union([z.number().positive(), z.tuple([z.number().positive(), z.number().positive()])])
      .optional(),
    ordering: z
      .object({
        status: z.enum(['open', 'waitlist', 'closed']),
        years: z.number().positive().optional(),
        note: z.string().optional(),
      })
      .optional(),
    website: z.string().regex(/^https?:\/\/.+/, 'expected http(s) URL').optional(),
    instagram: z
      .string()
      .regex(/^[A-Za-z0-9._]+$/, 'bare IG handle, no @ or URL')
      .optional(),
    price: z
      .object({
        text: z.string().min(1),
        amount: z.number().positive().optional(),
        currency: currency.optional(),
      })
      .refine((o) => (o.amount == null) === (o.currency == null), {
        message: 'amount and currency must come together',
      })
      .optional(),
    models: z.array(model).optional(),
    awards: z.array(award).optional(),
    tags: z.array(z.string().min(1)).optional(),
    sources: z.array(z.string().regex(/^https?:\/\/.+/)).optional(),
    last_verified: isoDate.optional(),
    added: isoDate,
    updated: isoDate,
    doc_heading: z.string().optional(),
    body: z.string().min(1),
  });
}
