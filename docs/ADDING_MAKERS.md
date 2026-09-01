# Adding and updating makers

Git is the CMS. Every maker is exactly one YAML file in
`src/content/makers/<slug>.yaml`, validated by the Zod schema in
`src/content/makerSchema.mjs` (SPEC.md section 4 is the prose contract).
This document is the complete workflow; you do not need to read the rest of
the codebase to add a maker.

## Add a maker

1. **Research first.** Brand site, press (Hodinkee, SJX, Revolution,
   Monochrome, Fried/ABTW when relevant), Instagram. Verify the website and
   IG handle actually resolve; never paste a dead or placeholder URL.
   Known traps: `christopheclaret.com` is casino-hijacked,
   `philippinedufour.ch` is a lorem-ipsum placeholder. Neither may ever
   appear in data.
2. **Scaffold the record:**

   ```bash
   pnpm new:maker bradley-taylor B   # slug [tier, default D]
   ```

   This writes `src/content/makers/bradley-taylor.yaml` with a valid
   skeleton. Fill every field you have evidence for and delete what does
   not apply; all keys except `name`, `slug`, `type`, `tier`, `status`,
   `added`, `updated`, `body` are optional.

3. **Validate.** `pnpm validate` runs the Zod schema over every file plus
   slug/name uniqueness, URL formats and enum checks. It also prints (but
   does not fail on) the gap report of makers missing a website or IG.
   The validator is the gate; CI runs it on every PR.
4. **Build and look.** `pnpm build` then `pnpm preview` and open
   `/watchmakers/makers/<slug>/`, plus the index card and a search that
   should find it.
5. **Commit:**

   ```
   data: add Bradley Taylor (Tier D)
   ```

## Field rules that matter

- **slug**: lowercase kebab-case, unique, stable. Never rename a slug for
  style reasons; the URL is the identifier.
- **scores**: `A` = movement authorship, `M` = physical manufacture. They
  measure independence of movement creation, **not quality**. A value is a
  number (`3`, `4.5`) or a `[min, max]` range (`M: [3.5, 4]`) when the
  source claims a range. The full rubric renders on the About page; the
  About rubric and scores go in together or not at all.
- **movement_making classes**:
  `full_inhouse` (everything that can be made in-house, is),
  `partial` (own core calibre, some outside effort),
  `finished_ebauche` (bought movement, finished in-house),
  `vintage_restoration` (restored vintage calibres).
- **models vs price fallback**: structure a maker's pricing into `models[]`
  when each current watch has a name and a price you can tie to it. If the
  pricing information is a single composite or vague figure ("est.
  USD 15-25k depending on finishing"), keep the whole sentence in the
  maker-level `price.text` fallback and don't invent per-model rows.
- **Price hygiene (critical)**: **current, retail-side prices only.**
  Auction results, dealer/secondary listings, historical retail figures and
  "in today's money" conversions must never become structured `models[]`
  prices or `price.amount`s and never become sort anchors. Keep them as
  narrative in `price.text` or the body. The derived sort price
  (`priceFromGBP`, computed at build from the min CURRENT model price,
  converted via `data/fx-gbp.json`) exists for browse order; if you would
  not quote the number to Ruben as "what it costs new today", it does not
  belong in a numeric field.
- **Currency**: one of `USD CHF EUR GBP JPY AUD HKD`. Amount and currency
  always travel as a pair (the schema refuses one without the other).
- **sources**: public editorial/brand URLs that back the claims. They
  render at the foot of the maker page with the `last_verified` date.
- **Dates**: `added` and `updated` are required ISO dates; refresh
  `last_verified` whenever you re-check links. `updated` bumps on any
  content change; the detail page shows it.

## Update a maker

Edit the YAML in place (tier moves, new award, production change, ordering
flip), bump `updated`, refresh `last_verified` when links were re-checked,
validate, build, commit as `data: update <Name> (<what changed>)`, push.
Git history is the audit trail.

## Tier moves

Change `tier`, adjust `tier_note` with the reason, bump `updated`. The
tiers board, cards and prev/next navigation regenerate automatically at
build time.

## Known intentional gaps

The seed data has documented holes (13 makers without a website, 14 without
Instagram, 13 without a public price, 11 Tier S condensed entries without
scores). These are deliberate "unknown until verified", not bugs; the
validator's gap report tracks them. Fill one only when you have a verified
source, and cite it in `sources`.
