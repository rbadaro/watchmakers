/**
 * Build-time endpoint emitting the browse/search index consumed by the
 * BrowseApp island (SPEC section 6). One compact record per maker; prices
 * are pre-derived (GBP for sorting/banding, original-currency text for
 * display) from the dated FX snapshot.
 */

import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import fxJson from '../../data/fx-gbp.json';
import { priceFromGBP, fromLine } from '../lib/prices';
import type { FxSnapshot } from '../lib/prices';
import { firstSentence } from '../lib/format';

const fx = fxJson as unknown as FxSnapshot;

export const GET: APIRoute = async () => {
  const makers = await getCollection('makers');
  const index = makers.map((entry) => {
    const d = entry.data;
    return {
      slug: d.slug,
      name: d.name,
      people: d.people ?? [],
      aliases: d.aliases ?? [],
      tier: d.tier,
      country: d.country ?? '',
      location: d.location ?? '',
      movement_making: d.movement_making ?? '',
      orderingStatus: d.ordering?.status ?? null,
      models: (d.models ?? []).map((model: { name: string }) => model.name),
      priceText: fromLine(d, fx),
      priceFromGBP: priceFromGBP(d, fx),
      awards: (d.awards ?? []).map((award: { name: string }) => award.name),
      bodyExcerpt: firstSentence(d.body),
      added: d.added,
      updated: d.updated,
    };
  });
  return new Response(JSON.stringify(index), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
