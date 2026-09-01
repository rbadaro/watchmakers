# Movement Map

An index of independent watchmakers: a static, searchable directory of 112
tracked independent makers, built from a private comparative research
document. Git is the CMS: every maker is one YAML record in
`src/content/makers/`, validated by a Zod schema, rendered by Astro.

Live at `https://rbadaro.github.io/watchmakers` once the remote is wired up
(the repo deploys to GitHub Pages; base path is `/watchmakers` everywhere).

## Stack

- Astro 5, static output, TypeScript strict
- Tailwind CSS v4 via `@tailwindcss/vite` (light theme only, one accent)
- Preact for the single interactive island (browse/search on the index)
- Fuse.js 7 for client-side fuzzy search over a build-time JSON index
- YAML content collection, Zod-validated at build and via `pnpm validate`
- pnpm 9, Node 22 LTS
- GitHub Actions: type-check + build on PRs, deploy to Pages from `main`

## Prerequisites

- Node 22 (LTS)
- pnpm 9 via corepack: `corepack enable && corepack prepare pnpm@9 --activate`

## Commands

```bash
pnpm install      # install dependencies
pnpm dev          # dev server (serves at http://localhost:4321/watchmakers/)
pnpm check        # astro check: strict TS + Astro diagnostics
pnpm validate     # validate every maker YAML, print the website/IG gap report
pnpm build        # production build to dist/ (116 pages)
pnpm preview      # serve the production build under /watchmakers/
pnpm new:maker    # scaffold a new maker YAML skeleton
pnpm smoke:browse # node smoke of the filter/sort/search logic on fixtures
```

## Repository layout

- `src/content/makers/*.yaml` - one maker per file; **this is the data**
- `src/content/config.ts` - Zod schema (schema v2, SPEC section 4)
- `src/lib/` - makers, prices (FX + derivation), browse logic, formatters
- `src/components/` - `BrowseApp.tsx` (the island) + shared Astro components
- `src/pages/` - index, `makers/[slug]`, `tiers`, `about`, `404`,
  `search-index.json` endpoint
- `data/fx-gbp.json` - dated FX snapshot normalizing prices to GBP at build
- `scripts/` - validator, new-maker scaffolder, seed importer, smokes
- `docs/ADDING_MAKERS.md` - the add/update workflow (the real gate)
- `SPEC.md` - the full product spec and milestone checklist

## CI and deploy

- `.github/workflows/ci.yml` runs on push and PRs: corepack pnpm, frozen
  lockfile install, `astro check`, `astro build`.
- `.github/workflows/deploy.yml` runs on `main` only: same build, then
  `actions/configure-pages` -> `upload-pages-artifact` -> `deploy-pages`.
  GitHub Pages must be set to "GitHub Actions" source in repo settings.
- Base path is `/watchmakers` (configured in `astro.config.mjs`); every
  internal link and asset URL is built off `import.meta.env.BASE_URL`.

## Accessibility and performance

- Full keyboard path: skip link, real buttons/selects with `aria-pressed`,
  accent focus rings (`#0066CC`) on every interactive control, polite live
  region for result counts, valid heading order.
- WCAG AA contrast verified: all text >= 4.5:1 on its surface
  (`ink-faint` is only used on white card surfaces; tertiary-on-page text
  uses `ink-dim`).
- `prefers-reduced-motion`: all transitions collapse to 0.01ms and the card
  hover lift is `motion-safe:` gated.
- Lighthouse 13.4.1, headless Chromium 146, local static server over `dist`
  (2026-09-01):

  | Route | Performance | Accessibility | Best Practices | SEO |
  |---|---|---|---|---|
  | `/watchmakers/` | 96 | 100 | 100 | 100 |
  | `/watchmakers/tiers/` | 100 | 100 | 100 | 100 |
  | `/watchmakers/makers/bradley-taylor/` | 100 | 100 | 100 | 100 |

  Index metrics: FCP 1.2s, LCP 1.5s, TBT 164ms, CLS 0.08 (simulated
  throttling). The accessibility audits are axe-core powered, so these runs
  also certify zero axe violations. Re-run locally with:

  ```bash
  pnpm build && pnpm preview &
  pnpm exec lighthouse http://localhost:4321/watchmakers/ \
    --chrome-flags="--headless=new --no-sandbox" --output=json --quiet
  ```

## Data notes

- Prices normalize to GBP at **build time only** via `data/fx-gbp.json`
  (snapshot 2026-09-01, indicative); cards always display the original
  currency. Derived `priceFromGBP` and the "from" line are computed by
  `src/lib/prices.ts`; never stored in YAML.
- Auction, dealer and historical figures stay out of structured prices by
  policy (see `docs/ADDING_MAKERS.md`, price hygiene rule); they live in the
  maker-level narrative fallback instead.
- Known gaps (13 makers without a website, 14 without Instagram, 13 without
  a public price) are printed by `pnpm validate` and documented on About.
