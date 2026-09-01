/**
 * Data access for the makers collection.
 *
 * M2: the collection is live (src/content/makers/*.yaml via the glob
 * loader in src/content/config.ts). Every consumer renders from these
 * functions, never from hardcoded counts.
 */

import { getCollection } from 'astro:content';

export type MakerEntry = Awaited<ReturnType<typeof listMakers>>[number];

export interface MakerSummary {
  slug: string;
  name: string;
}

export async function listMakers() {
  const makers = await getCollection('makers');
  const byTier: Record<string, number> = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5 };
  return makers.sort(
    (a, b) => byTier[a.data.tier] - byTier[b.data.tier] || a.data.name.localeCompare(b.data.name),
  );
}

export async function makerCount(): Promise<number> {
  const makers = await getCollection('makers');
  return makers.length;
}
