import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { makeMakerSchema } from './makerSchema.mjs';

// Schema v2 lives in makerSchema.mjs so scripts/validate.mjs can share it.
const makers = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/content/makers' }),
  schema: makeMakerSchema(z),
});

export const collections = { makers };
