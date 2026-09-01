# Movement Map

An index of independent watchmakers. Static Astro 5 site, deployed to GitHub
Pages at `https://rbadaro.github.io/watchmakers` once the remote is wired up.

Work in progress: the site is scaffolded (M1). The data layer (M2) and the
browse UI (M3) are next. See `SPEC.md` for the full plan and the build
checklist.

## Prerequisites

- Node 22
- pnpm 9 via corepack: `corepack enable && corepack prepare pnpm@9 --activate`

## Commands

```bash
pnpm install     # install dependencies
pnpm dev         # local dev server
pnpm astro check # type check (astro + strict TS)
pnpm build       # production build to dist/
pnpm preview     # serve the production build locally
```
