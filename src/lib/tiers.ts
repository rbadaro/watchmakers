/**
 * Tier metadata: presentation order and the one-line meaning of each tier,
 * taken from the source document's tier section headings (SPEC section 5
 * tiers board).
 */

export type Tier = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'M' | 'I';

export const TIERS: Tier[] = ['S', 'A', 'B', 'C', 'D', 'E', 'M', 'I'];

export const TIER_MEANING: Record<Tier, string> = {
  S: 'The modern canon',
  A: 'Established masters',
  B: 'Cult masters and the new establishment',
  C: 'The new generation has been discovered',
  D: 'First commercial generation',
  E: 'Patron stage, before a mature commercial market',
  M: 'Independent manufactures worth knowing',
  I: 'Important independents that fit the movement-first thesis less cleanly',
};
