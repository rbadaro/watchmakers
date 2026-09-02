# Independent Watchmakers Map — Spec v0.1

Companion static site to the Google Doc "Independent Watchmaking: Movement-Makers,
Emerging Masters and the Modern Canon". The doc stays the long-form narrative;
the site is the structured, searchable tracker of every maker in it.

Status: draft for review. Stack confirmed by Ruben 31 Aug 2026 (Astro).

---

## 1. Purpose and non-goals

**In scope (v1)**
- Browse, search, and filter all makers tracked in the doc (88 entries at seed time)
- One canonical URL per maker, shareable
- Tier, A/M scores, price, location, links, awards, body notes per maker
- Public static hosting on GitHub Pages, zero runtime cost
- A documented, scriptable data layer so an agent (Bill) can add or update makers safely

**Out of scope (v1)**
- No backend, accounts, or CMS. Git is the CMS.
- No editing UI (a form that emits YAML is a possible v1.1)
- No maker photos or logos (avoids image hosting and rights questions)
- No price history charts, no watchlist state

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Astro 5 (SSG mode) | Zero JS by default; per-maker static URLs; content collections give schema-checked data |
| Language | TypeScript, strict | |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) | Matches Ruben's other stack; theme tokens in CSS |
| Data | YAML content collection + Zod schema (`astro:content`) | One file per maker, diffs well in Git, build fails on bad data |
| Search | Fuse.js 7 over a build-generated `search-index.json` | Weighted fuzzy search, instant at this scale, composes with structured filters |
| Interactive island | Preact (via `@astrojs/preact`, compat mode) | Only the browse widget hydrates; ~4 KB vs ~40 KB for React |
| Package manager | pnpm 9, Node 22 LTS | |
| CI/CD | GitHub Actions: `astro check` + build on every push, deploy to Pages on `main` via `withastro/action` | |

This stack deliberately shares nothing with the June fullstack plan
(Next.js + Postgres). That plan fits interactive apps; this is a content site.

---

## 3. Repository layout

```
watchmakers-app/
  astro.config.mjs
  package.json  pnpm-lock.yaml  tsconfig.json
  README.md  SPEC.md  docs/ADDING_MAKERS.md
  public/
    favicon.svg
  src/
    content/
      config.ts              # Zod schema = the data contract
      makers/*.yaml          # one file per maker, <slug>.yaml
    pages/
      index.astro            # browse: search + filters + grid (hydrated island)
      makers/[slug].astro    # maker detail
      tiers.astro            # tier board, makers grouped S..E
      about.astro            # methodology, provenance, build timestamp
      404.astro
      search-index.json.ts   # build-time endpoint emitting the Fuse index
    components/
      MakerCard.astro  TierBadge.astro  FactRow.astro
      BrowseApp.tsx          # Preact island: search box, chips, sort, grid
    lib/
      search.ts  format.ts  tiers.ts
    styles/
      global.css             # Tailwind v4 + theme tokens
  scripts/
    seed-from-doc.mjs        # one-time import from ~/workspace/watchdoc-research
    new-maker.mjs            # scaffold a new maker YAML interactively
    validate.mjs             # schema + slug/name uniqueness + URL format checks
  .github/workflows/
    ci.yml                   # check + build on PR
    deploy.yml               # build + deploy to Pages on main
```

---

## 4. Data contract (the important part)

Every maker is `src/content/makers/<slug>.yaml`. The Zod schema in
`src/content/config.ts` is normative and enforced at build time.

Schema v2 approved by Ruben 31 Aug 2026. Core idea: a maker is not a directory
listing but a tracked entity with an embedded model/series collection, craft
classification, and market-access state.

```yaml
name: Bradley Taylor
slug: bradley-taylor              # ^[a-z0-9]+(-[a-z0-9]+)*$, unique
type: individual                  # individual | duo | atelier | brand
people: [Bradley Taylor]          # searchable names behind the record
aliases: [Birchall & Taylor]      # optional, old/other names, feeds search
tier: D                           # enum: S | A | B | C | D | E | M | I
tier_note: knocking on C          # optional free text, shown next to badge
scores: { A: 3, M: 3 }            # optional, floats 0..5; a [min, max] pair is
                                  # allowed for the doc's range scores, e.g.
                                  # M: [3.5, 4] for "M3.5-4" in the doc
                                  # axes (rubric lives on About, verbatim from
                                  # doc intro): A = movement authorship,
                                  # M = physical manufacture; scores measure
                                  # independence of movement creation, not
                                  # quality
status: active                    # active | dormant | retired
location: North Vancouver, Canada
country: Canada
founded: 2020                     # optional, year current venture began
lineage:                          # optional, training/mentorship line
  - Trained in Le Locle under Henrik Korpela
  - Patek Philippe Level II service certification, Geneva
movement_making: full_inhouse     # full_inhouse | partial | finished_ebauche | vintage_restoration
production_per_year: [10, 20]     # optional estimate range
ordering: { status: open }        # open | waitlist | closed; optional years + note
website: https://bradleytaylor.ca # optional, https URL
instagram: bradleytaylor.ca       # optional, bare handle without @
price:                            # optional FALLBACK summary, only when models unknown
  text: "USD 60,000 to 90,000"
  amount: 60000
  currency: USD                   # enum: USD | CHF | EUR | GBP | JPY | AUD | HKD
models:                           # the watch/series collection
  - name: Ardea
    calibre: Cal. 475RS, hand-wound   # optional
    years: { introduced: 2025 }       # until: optional
    production: { series_total: 50 }  # or { per_year: N } or { note: "..." }
    status: current                   # current | sold_out | discontinued
    prices:
      - { text: stainless steel, amount: 62000, currency: USD }
      - { text: platinum, amount: 82500, currency: USD }
  - { name: Paragon, status: sold_out }   # minimal history entries are legal
  - { name: Lutria, status: sold_out }
awards:
  - { year: 2026, name: HSNY Independent Watchmaker Grant, result: winner }
    # optional models: [Fundamentum] when the award attaches to a watch
tags: []                          # optional, lowercase kebab
sources:                          # press/brand URLs used for verification
  - https://www.hodinkee.com/articles/...
last_verified: 2026-08-31         # when links/prices were last checked
added: 2026-08-29                 # ISO date, when the record entered the tracker
updated: 2026-08-31               # ISO date, last meaningful edit
doc_heading: Bradley Taylor       # maps record back to the doc, survives renames
body: |
  Bradley Taylor works alone in a 1,000 square foot workshop in North Vancouver...
```

Rules:
- `slug` and `name` unique across the collection (validator enforces)
- Derived, never stored: card display price and price sorting come from the
  minimum `prices.amount` across `models` with `status: current` ("from USD
  62,000"); `price` fallback is used only when no current model has amounts;
  records with neither sort last
- The renderer prefers `models`; the validator warns (does not fail) when a
  record has neither `models` nor `price`
- `body` is Markdown, rendered on the detail page; card shows first sentence
- Known doc duplicate headings (Romain Gauthier, Andreas Strehler) map to
  exactly one record each; the doc's duplication is not replicated here
- Cut deliberately: tier history (Git gives the timeline), case specs, and
  secondary-market pricing (maintenance treadmills)

---

## 5. Routes and UX

**`/` (browse)** — the app. Sticky frosted header with the search input; below
it the filter bar: tier chips (All, S, A, B, C, D, E, M, I), a country dropdown
derived from the data, a movement-making toggle (full in-house only), price
band chips (Any / under £50k / £50-150k / £150-300k / £300k+), and a sort
control. A live result count. All makers render at once as one flat grid, no
pagination, no infinite scroll.

Browse UX, settled by Ruben 31 Aug 2026:
- Default view: flat directory, ordered tier S to E then name A to Z within
  tier (option B from the design Q&A; the pyramid view lives only on /tiers)
- Card anatomy (lean): tier badge, name, location, "from" price line, first
  sentence of body, plus an ordering-status pill when books are open or
  waitlisted. A/M scores deliberately stay off the card (detail page only)
- Prices: normalized to GBP at build time from a dated FX snapshot committed
  to the repo; used only for sorting, price bands, and the "from" line.
  Display is always the original currency. Unknown price sorts last in both
  directions
- Filters: tier chips, country dropdown, movement toggle, price bands. An
  active price band excludes records without a public price, shown with a
  note: "N makers without public prices are hidden by this filter"
- Sort: default tier then name; overrides Name A to Z, Price low to high,
  Price high to low, Recently updated. While search text is present, relevance
  takes over and the sort control is disabled
- State mirrored to query params (`?q=&tier=&country=&movement=&band=&sort=`),
  every combination a shareable link

Search behaviour, approved as proposed:
- Instant as-you-type, no enter key; matched text highlighted in names
- Searched fields beyond name: people, aliases, model names, awards, location,
  country, body excerpt; name weighted dominant
- Fuse threshold around 0.3 (typo-tolerant: "journ" finds Journe)
- Match-reason line on cards surviving via model/award/location, e.g.
  "Model: Ardea", so non-name hits never look random
- Empty state: "No makers match" plus a one-tap clear-all reset

**`/makers/[slug]/`** — detail page, settled 31 Aug 2026:
- Two-column desktop layout: body Markdown left, narrow fact rail right (name,
  tier badge + tier_note, A/M scores with a footnote link to the About
  explanation, status, location, founded, movement_making,
  production_per_year, ordering state, lineage, website, IG, awards list,
  added / updated / last_verified dates). Stacks to one column on mobile.
- Models as a full-width table below the body: one row per model, columns
  name / calibre / years / production / prices / status pill (option A);
  collapses to stacked label-value rows on mobile. Minimal sold-out entries
  render as quiet, unexpandable rows.
- Sources visible at the page foot, labelled outlet + date (e.g. "Hodinkee,
  Dec 2025"). Provenance as a design feature.
- Foot navigation: prev/next within the tier, labelled with the makers'
  names, plus a back link that restores the grid's filter state from the URL.

**`/tiers/`** — board view: one lane per tier S through E plus M and I, makers as compact
rows. Cheap to build, useful for sanity-checking tier placements against the doc.

**`/about/`** — what the site is, data provenance (compiled from public press
and brand sources, curated in the Google Doc), scoring axis explanation, build
timestamp from CI, link back to the doc.

**404** — on brand, links home.

Chrome, settled 31 Aug 2026 (option A): header carries the site title left and
"Tiers" + "About" links right. Footer carries the build date, live maker
count, and a link to the GitHub repo. The About page holds methodology and
provenance, the A/M scoring axes explained, the FX snapshot date used for GBP
normalization, and the known-gaps list (makers still missing website or IG).

Visual direction (approved by Ruben 31 Aug 2026): light, clean, Apple-product
feel. No dark theme is designed or shipped; tokens are structured so one could
be added later.

- Surfaces: page `#F5F5F7`, cards white, hairline borders `rgba(0,0,0,0.06)`,
  card radius 16-18px, shadow `0 2px 12px rgba(0,0,0,0.06)` at most
- Type: system stack (-apple-system first, SF Pro on Apple devices), headings
  at `letter-spacing: -0.02em`, prices and figures in `tabular-nums`
- Color discipline: grayscale everywhere, one accent (Apple link blue
  `#0066CC`) reserved for interactive affordances; no gradients
- Tier badges: quiet tinted chips, pastel background with a 600-level text
  color: S champagne, A violet, B blue, C green, D amber, E slate, M teal, I pink
- Header: sticky, frosted glass (`backdrop-blur`, white at 80%), holding the
  search input
- Motion: 150-200ms ease transitions only, honors `prefers-reduced-motion`
- Layout: 1200px max content width, card grid 1/2/3 columns
- No component library; hand-rolled Tailwind over these tokens

---

## 6. Search and index

- `src/pages/search-index.json.ts` emits at build time an array of
  `{ slug, name, people, aliases, tier, country, location, movement_making,
  orderingStatus, models (names), priceText, priceFromGBP, awards,
  bodyExcerpt, added, updated }`
- BrowseApp loads it lazily on first focus of the search input (~60-100 KB raw,
  ~20 KB gzip at 88 records; still trivial at 10x growth)
- Fuse options: keys `name` (0.4), `aliases` + `people` (0.15), `models` (0.15),
  `awards` (0.15), `bodyExcerpt` (0.1), `location` + `country` (0.05);
  threshold 0.3; ignoreLocation true
- Structured filters apply after/alongside search: filter narrows the set,
  Fuse ranks within it. Searching with no text just filters.
- Price sort and bands use `priceFromGBP` (normalized at build); missing values
  sort last regardless of direction

---

## 7. CI/CD

`.github/workflows/deploy.yml`: checkout → setup Node 22 → pnpm cache →
install → `pnpm astro check` → `pnpm build` → upload `dist/` as Pages artifact
→ deploy on `main` only. PRs run check + build without deploy.

Site config: `site` and `base` set in `astro.config.mjs`; works on
`https://<user>.github.io/<repo>` out of the box, custom domain later via a
`public/CNAME` file and one DNS record.

---

## 8. Adding and updating makers (agent workflow)

This is the workflow Bill runs when Ruben says "add X to the tracker".

1. Research the maker (press, brand site, IG) per our standard validation bar
2. Run `pnpm new:maker` (scripts/new-maker.mjs) to scaffold the YAML skeleton,
   or write the file directly; fill all fields per section 4
3. Run `pnpm validate` (scripts/validate.mjs): Zod parse of every file, slug
   and name uniqueness, URL format, enum checks, and it prints a gap report
   (records missing website/IG) without failing on them
4. Run `pnpm build` locally to confirm the site compiles and the new maker
   renders (index card + detail page + search index entry)
5. Commit as `data: add <Name> (Tier X)` or `data: update <Name> (<what changed>)`,
   push, Actions deploys

Updates (tier moves, price changes, new awards) edit the YAML in place and bump
`updated`. Git history is the audit trail; the detail page shows the date.

The contract plus `docs/ADDING_MAKERS.md` means any future agent session can do
this without reading the whole codebase: read the schema number one, run the
validator number two, build number three.

Possible v1.1: an "Add maker" page that renders a filled YAML block ready to
paste into a commit (client-side only, no backend).

---

## 9. Seed import

One-time `scripts/seed-from-doc.mjs` converts the existing research files into
YAML records:

- `agent1-8.json` (tiers S/A/B price + website + IG research, per-maker notes)
- `copy_tierc.json` and `copy_tierd.json` (prize-channel copy: heading, price,
  website, IG, location + A/M scores, body paragraphs, awards)
- `browser_results.json` (verified IG handles and websites from the full-browser pass)

Known handling: dedupe Romain Gauthier and Andreas Strehler (appear twice in
the doc); strip the `Estimated price:` / `Website:` / `Instagram:` prefixes from
doc copy; preserve body paragraphs verbatim; set `added` to 2026-08-29 (bulk
doc import) or 2026-08-31 (prize entries).

Output: 86-88 YAML files plus a printed gap report of records still missing
website or IG (the known genuine gaps are documented in project memory).

---

## 10. Milestones and build checklist

Execution order with per-step boxes. Boxes get ticked as work lands and each
tick is committed, so the spec doubles as the build log. Local git repo lives
at `~/workspace/watchmakers-app` from day one; push to GitHub happens as soon
as the repo answers in section 11 arrive. Commit conventions: `feat:`, `fix:`,
`data:`, `docs:`, `chore:`, small commits per step.

**M1 Scaffold** — acceptance: `pnpm build` green locally, empty themed shell
renders; once remote exists, push to main deploys to Pages (live URL 200).

- [x] `pnpm create astro` minimal template, TypeScript strict
- [x] Tailwind v4 via `@tailwindcss/vite`; light theme tokens in global.css
      (Apple palette from section 5, no dark palette)
- [x] `pnpm add @astrojs/preact preact fuse.js` + astro check wired into scripts
- [x] Base layout with settled chrome (title left, Tiers + About right;
      footer with build date, maker count, GitHub link)
- [x] Empty index page rendering through the layout
- [x] `astro.config.mjs` site/base set for Pages (project-pages base path)
- [x] `.github/workflows/ci.yml` (check + build) and `deploy.yml` (build +
      Pages deploy on main), deploy deferred until remote exists
- [x] README stub with setup commands

**M2 Data layer** — acceptance: `pnpm build` green with all makers; validator
green; gap report matches the documented known gaps.

- [x] `src/content/config.ts`: Zod schema v2 exactly per section 4
- [x] `scripts/validate.mjs`: parse every YAML, slug/name uniqueness, URL
      format, enum checks, gap report (missing website/IG) as warning
- [x] `scripts/new-maker.mjs`: scaffolds a valid YAML skeleton
- [x] `data/fx-gbp.json`: dated FX snapshot for GBP normalization
- [x] `lib/prices.ts`: derive `priceFromGBP` and display "from" line
- [x] `scripts/seed-from-doc.mjs`: import from `~/workspace/watchdoc-research`
      (agent1-8.json, copy_tierc.json, copy_tierd.json, browser_results.json);
      dedupe Romain Gauthier and Andreas Strehler to one record each; strip
      "Estimated price:" / "Website:" / "Instagram:" prefixes; body verbatim;
      added dates per spec
- [x] Run seed; hand-check 5 random files including one sparse record
- [x] Regenerate any maker-level price text into `models` where parseable,
      `price` fallback where not

**M3 Browse** — acceptance: query params round-trip; result count correct
across filter combinations; sort disables during search.

- [x] `src/pages/search-index.json.ts` endpoint per section 6 fields
- [x] `BrowseApp` island, index JSON fetched once on mount instead of on
      first search focus, so the grid renders without an interaction (still
      zero per-keystroke fetches; change of detail noted in build log)
- [x] Search: instant, highlight in names, Fuse weights/threshold per section 6,
      match-reason line, empty state with clear-all reset
- [x] Filter bar: tier chips, country dropdown, full-in-house toggle, price
      band chips (incl. unknown-price exclusion note), sort control
- [x] URL sync `?q=&tier=&country=&movement=&band=&sort=`, back/forward works
      (typing replaceState, discrete changes pushState, popstate restores)
- [x] Card grid: all makers at once, card anatomy per section 5
      (lean + ordering pill), default order tier then name

**M4 Detail, tiers, about** — acceptance: every slug resolves; prev/next and
back-with-state work; build timestamp renders.

- [x] `[slug].astro`: two-column layout, fact rail per settled list, stacks on
      mobile
- [x] Models table: rows name/calibre/years/production/prices/status pill,
      label-value stack on mobile, quiet sold-out rows
- [x] Sources list (outlet + date) at page foot
- [x] Prev/next within tier (name-labelled), back link restoring filter state
- [x] `tiers.astro` pyramid board S to E
- [x] `about.astro`: methodology, A/M axes (needs Ruben's definition first),
      FX snapshot date, known-gaps list
- [x] `404.astro`

**M5 Polish** — acceptance: Lighthouse run filed in README; no axe-critical
issues.

- [x] Empty states, focus rings, aria labels on all interactive controls,
      `prefers-reduced-motion` honored
- [x] Favicon
- [x] Lighthouse pass on /, one detail page, /tiers
- [x] README full + `docs/ADDING_MAKERS.md` (the section-8 workflow)

**M6 First real adds** — run the section-8 workflow end to end on the next
makers Ruben green-lights for the doc.

---

## 11. Setup decisions (all resolved 31 Aug 2026)

- Repo: `github.com/rbadaro/watchmakers`, public (Ruben's handle, public
  approved). Local repo at `~/workspace/watchmakers-app`; the push waits for
  GitHub authentication (gh installed but not logged in).
- Wordmark: "Movement Map", subtitle "An index of independent watchmakers"
  (chosen by Bill per Ruben's delegation).
- Domain: ship on `rbadaro.github.io/watchmakers`; a custom subdomain later is
  one CNAME record plus `public/CNAME`.
- A/M axes (from the doc intro): A = movement authorship, M = physical
  manufacture; scores measure independence of movement creation, not quality.
  The rubric (A5/A4/A3 and M5/M4/M3/M2 definitions) renders verbatim on About.
- Toolchain note: this VM has no system Node 22. A user-local Node 22.23.2
  lives at `~/.local/node22` with pnpm 9.15.9 via corepack; builders must
  export `~/.local/node22/bin` onto PATH in every shell command (non-login
  shells do not read `.bashrc`).
