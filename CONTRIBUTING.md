# Contributing

Movement Map is a small static site where the data is the product. Humans
and agents contribute the same way: edit YAML, validate, build, commit.
SPEC.md is the full product contract; this file is the short version.

## The contract

- **Git is the CMS.** One maker per YAML file under `src/content/makers/`.
  The Zod schema (`src/content/makerSchema.mjs`, shared factory used by the
  Astro content layer and the validator) defines what is legal.
- **`pnpm validate` is the gate.** CI runs it plus `astro check` and a full
  build on every PR. Nothing merges red.
- **Small commits, one logical step each** (`data: add ...`,
  `data: update ...`, `feat: ...`, `fix: ...`, `docs: ...`).
- Derived data is computed at build time only (price normalization via the
  dated FX snapshot, the "from" line, card excerpts). Never store what can
  be derived.

## Before you write code

1. Read `SPEC.md` sections 4 and 8 (data contract, maker workflow).
2. Run `pnpm install` (Node 22, pnpm 9 from corepack).
3. After changes: `pnpm check`, `pnpm validate`, `pnpm build`; keep all
   three green. A pull request is not done until CI agrees.

## Working on makers data

Follow `docs/ADDING_MAKERS.md` exactly: it covers `pnpm new:maker`, the
required fields, A/M score semantics (independence, not quality), movement
classes, the models-vs-fallback rule, the price hygiene rule (current
retail-side prices only; auction, dealer and historical figures never
become numeric fields), sources and dates.

## Working on the UI

- Light theme only; tokens live in `src/styles/global.css`. One accent,
  `#0066CC`, for interactive affordances. No dark palette, no gradients.
- WCAG AA is a release requirement: text contrast >= 4.5:1 on its own
  surface (note: `ink-faint` passes only on white cards; on the
  `#F5F5F7` page background use `ink-dim`). Keyboard path on every
  control, visible `#0066CC` focus ring, polite live region for counts.
- `prefers-reduced-motion`: durations collapse globally; gate any new
  transform motion behind Tailwind's `motion-safe:` variant.
- All internal links go through `import.meta.env.BASE_URL` (base is
  `/watchmakers`), including inside the Preact island.
- The browse island keeps all filter/search/sort logic in the pure module
  `src/lib/browse.ts`; extend it there and extend `scripts/smoke-browse.mjs`
  to cover the change.

## Deploy

`main` deploys to GitHub Pages automatically via
`.github/workflows/deploy.yml` once the repository is wired to
`rbadaro/watchmakers` with Pages set to the GitHub Actions source. The site
is expected at `https://rbadaro.github.io/watchmakers/`.
