/**
 * Data access for the makers collection.
 *
 * M1 scaffold: the content collection does not exist yet, so these are
 * data-driven stubs that read 0 until M2 lands the YAML files and
 * src/content/config.ts. Every consumer renders from these functions,
 * never from hardcoded counts.
 */

export interface MakerSummary {
  slug: string;
  name: string;
}

export async function listMakers(): Promise<MakerSummary[]> {
  // M2: replace with getCollection('makers')
  return [];
}

export async function makerCount(): Promise<number> {
  const makers = await listMakers();
  return makers.length;
}
