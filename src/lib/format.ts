/**
 * Display formatting helpers shared by pages, endpoints, and the island.
 */

/**
 * First display sentence of a Markdown body, for card excerpts. Strips list
 * markers, links, and inline emphasis, stops at the first sentence end, and
 * clamps to `max` chars.
 */
export function firstSentence(markdown: string, max = 160): string {
  const firstPara =
    markdown.split(/\n\s*\n/).find((p) => p.trim().length > 0) ?? markdown;
  const plain = firstPara
    .replace(/^\s*[-*+#]\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = plain.match(/^(.+?[.!?])(\s|$)/);
  let sentence = match ? match[1] : plain;
  if (sentence.length > max) {
    sentence = `${sentence.slice(0, max - 1).trimEnd()}…`;
  }
  return sentence;
}
