#!/usr/bin/env node
/**
 * Seed src/content/makers/*.yaml from the research corpus in
 * ~/workspace/watchdoc-research (READ-ONLY inputs):
 *
 *   doc_final6.json   live Google Doc dump (tiers, locations, scores, bodies)
 *   agent1-8.json     validated price / website / instagram for the original 86
 *   copy_tierc.json   9 prize-channel Tier C entries (backfill)
 *   copy_tierd.json   16 prize-channel Tier D entries (backfill)
 *   browser_results.json  full-browser verified website / instagram overrides
 *
 * The doc is the single source of truth for: tier, location, scores, body.
 * Websites/IG: browser results > agents > copy files > doc lines.
 * Prices: agent price > copy price > doc price line (they should agree).
 *
 * Source reality: 11 established Tier S canon brands (Sartory-Billard, Ming,
 * Ressence, Naoya Hida, Stepan Sarpaneva, Czapek, Singer Reimagined, Trilobe,
 * Holthinrichs, Bernard Mermont, Simon LeFrancois) are condensed entries in
 * BOTH doc snapshots: no location line, no A/M scores, one-line body. They
 * are imported with tier from document position and scores/location left
 * empty. Nothing is invented.
 *
 * The script is idempotent: every run rewrites the full maker set. Manual
 * corrections live in the META tables below, never in the YAML files.
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { dump } from 'js-yaml';

const ROOT = new URL('..', import.meta.url).pathname;
const RESEARCH = join(process.env.HOME, 'workspace', 'watchdoc-research');
const OUT_DIR = join(ROOT, 'src', 'content', 'makers');
const TODAY = '2026-08-31';
const ADDED_AGENT = '2026-08-29';

const loadJson = (name) => JSON.parse(readFileSync(join(RESEARCH, name), 'utf8'));

const doc = loadJson('doc_final6.json');
const agents = [];
for (let i = 1; i <= 8; i++) agents.push(...loadJson(`agent${i}.json`));
const copyC = loadJson('copy_tierc.json');
const copyD = loadJson('copy_tierd.json');
const browser = loadJson('browser_results.json');

/* ------------------------------------------------------------------ */
/* Doc parsing                                                         */
/* ------------------------------------------------------------------ */

const paras = [];
for (const el of doc.body.content) {
  if (!el.paragraph) continue;
  const p = el.paragraph;
  const style = p.paragraphStyle?.namedStyleType ?? 'NORMAL_TEXT';
  const text = p.elements.map((e) => e.textRun?.content ?? '').join('').replace(/\n$/, '');
  paras.push({ style, text });
}

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E'];
const tierAt = new Array(paras.length).fill(null);
let currentTier = null;
for (let i = 0; i < paras.length; i++) {
  const { style, text } = paras[i];
  if (style === 'HEADING_1') {
    const m = text.match(/Tier\s+([SABCDE])/i);
    if (m) currentTier = m[1].toUpperCase();
  }
  tierAt[i] = currentTier;
}

const LOC_RE = /\|\s*A\s*([\d.]+(?:\s*[–\-→]\s*[\d.]+)?)\s*\/\s*M\s*([\d.]+(?:\s*[–\-→]\s*[\d.]+)?)/;

/** Collect H2 blocks that are makers: a location|scores line, or a price line. */
const blocks = [];
for (let i = 0; i < paras.length; i++) {
  if (paras[i].style !== 'HEADING_2') continue;
  const lines = [];
  for (let j = i + 1; j < paras.length && paras[j].style !== 'HEADING_2' && paras[j].style !== 'HEADING_1'; j++) {
    lines.push(paras[j].text);
  }
  const locIdx = lines.findIndex((t) => LOC_RE.test(t));
  const isMaker = locIdx !== -1 || lines.some((t) => /^\s*Estimated price:/i.test(t));
  if (isMaker) blocks.push({ heading: paras[i].text, idx: i, tier: tierAt[i], lines, locIdx });
}

const LABELLED_LINE = /^\s*(Estimated price|Website|Instagram):|More information/i;
const richness = (b) => b.lines.filter((t, i) => i !== b.locIdx && t.trim() && !LABELLED_LINE.test(t)).length;

const makers = new Map(); // heading -> winning block
const duplicates = [];
for (const b of blocks) {
  if (makers.has(b.heading)) {
    // Duplicate heading (Romain Gauthier, Andreas Strehler): the LATER block
    // is the Tier S canon placement and owns the tier. The Tier A block owns
    // the content when it is richer (its prose is the established-masters
    // entry). Merge: canonical tier + richest lines.
    const prev = makers.get(b.heading);
    const content = richness(b) >= richness(prev) ? b : prev;
    makers.set(b.heading, { ...content, tier: b.tier });
    duplicates.push({ heading: b.heading, kept: b.tier, dropped: prev.tier });
    continue;
  }
  makers.set(b.heading, b);
}

/* ------------------------------------------------------------------ */
/* Cross-reference sources                                             */
/* ------------------------------------------------------------------ */

const norm = (s) =>
  (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/’/g, "'")
    .replace(/—/g, '-')
    .replace(/²/g, '2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const agentByHeading = new Map(agents.map((a) => [norm(a.heading), a]));
const copyByHeading = new Map([...copyC, ...copyD].map((c) => [norm(c.heading), c]));
const browserByHeading = new Map(browser.map((b) => [norm(b.heading), b]));

/* ------------------------------------------------------------------ */
/* Manual metadata tables (keyed by exact doc heading)                 */
/* ------------------------------------------------------------------ */

const CITY_COUNTRY = {
  geneva: 'Switzerland',
  'vallée de joux': 'Switzerland',
  glashütte: 'Germany',
  berlin: 'Germany',
  london: 'United Kingdom',
  beijing: 'China',
  tokyo: 'Japan',
  'isle of man': 'Isle of Man',
};

const COUNTRY_NORM = {
  usa: 'United States',
  'united states': 'United States',
  uk: 'United Kingdom',
  'united kingdom': 'United Kingdom',
};

/** "A / B" or "A & B / C" headings: person(s) behind the brand + search aliases. */
const COMPOSITES = {
  'Aaron Becsei / Bexei': { people: ['Aaron Becsei'], aliases: ['Bexei'] },
  'Aaron Sarauer / Sarauer Horology': { people: ['Aaron Sarauer'], aliases: ['Sarauer Horology'] },
  'Bernhard Zwinz / Winnerl': { people: ['Bernhard Zwinz'], aliases: ['Winnerl'] },
  'Bonniksen — Maximin Chapuis & Jason Chevrolat': { people: ['Maximin Chapuis', 'Jason Chevrolat'], aliases: ['Bonniksen'] },
  'Denis Flageollet / De Bethune': { people: ['Denis Flageollet'], aliases: ['De Bethune'] },
  'Dominique Buser & Cyrano Devanthey / Oscillon': { people: ['Dominique Buser', 'Cyrano Devanthey'], aliases: ['Oscillon'], type: 'atelier' },
  'Jiro Katayama / Ōtsuka Lōtec No.9': { people: ['Jiro Katayama'], aliases: ['Ōtsuka Lōtec', 'Otsuka Lotec', 'Ōtsuka Lōtec No.9'] },
  'Krayon / Rémi Maillat': { people: ['Rémi Maillat'], aliases: ['Krayon'] },
  'Masa Nakajima / Masa & Co.': { people: ['Masa Nakajima'], aliases: ['Masa & Co.', 'Masa & Co'] },
  'Nicholas Hacko / NHW': { people: ['Nicholas Hacko'], aliases: ['NHW', 'Nicholas Hacko Watches'] },
  'Norifumi Seki / Quiet Club': { people: ['Norifumi Seki'], aliases: ['Quiet Club'] },
  'Philippe Narbel / Narbel & Co': { people: ['Philippe Narbel'], aliases: ['Narbel & Co', 'Narbel & Co.'] },
  'RGM / Roland G. Murphy': { people: ['Roland G. Murphy'], aliases: ['RGM'] },
  'Rexhep Rexhepi / Akrivia': { people: ['Rexhep Rexhepi'], aliases: ['Akrivia', 'RRCC'], type: 'atelier' },
  'Romain Gauthier': { type: 'brand' },
  'Shiming Yang / Mgraver': { people: ['Shiming Yang'], aliases: ['Mgraver'] },
  'Shona Taine / Khemea': { people: ['Shona Taine'], aliases: ['Khemea'] },
  'Svend Andersen / Andersen Geneve': { people: ['Svend Andersen'], aliases: ['Andersen Geneve', 'Andersen Genève'] },
  'Xinyan Dai / Fam Al Hut': { people: ['Xinyan Dai'], aliases: ['Fam Al Hut'] },
};

/** Extra people for plain (non-composite) headings, where well attested. */
const PEOPLE_EXTRA = {
  'Habring²': ['Maria Habring', 'Richard Habring'],
  'J.N. Shapiro': ['Joshua Shapiro'],
  'McGonigle Watches': ['Stephen McGonigle', 'John McGonigle'],
  'Petermann Bédat': ['Gaël Petermann', 'Florian Bédat'],
};

const ALIASES_EXTRA = {
  'Habring²': ['Habring2'],
  'J.N. Shapiro': ['JN Shapiro'],
  'Stefan Kudoke': ['Kudoke', 'Kudoke Watches'],
  'Charles Frodsham': ['Frodsham', 'Charles Frodsham & Co'],
  'H. Moser & Cie.': ['H. Moser & Cie', 'Moser'],
  'Nicholas Hacko / NHW': ['NHW'],
  'Roger W. Smith': ['RW Smith', 'Roger Smith'],
};

const BRAND_TYPES = new Set([
  'Romain Gauthier', 'F.P. Journe', 'Konstantin Chaykin', 'Christophe Claret', 'Charles Frodsham',
  'Laurent Ferrier', 'De Bethune', 'Urwerk', 'MB&F', 'Greubel Forsey', 'Armin Strom',
  'H. Moser & Cie.', 'Schwarz Etienne', 'Bovet', 'Czapek', 'Ming', 'Ressence', 'Trilobe',
  'Zeitwinkel', 'Holthinrichs', 'Lang & Heyne', 'Moritz Grossmann', 'Grönefeld', 'Habring²',
  'Bexei', 'Winnerl', 'Garrick', 'Niton', 'Mineroci', 'McGonigle Watches', 'Aubert & Ramel',
  'Bonniksen — Maximin Chapuis & Jason Chevrolat',
]);
const ATELIER_TYPES = new Set([
  'Atelier Pieters', 'Atelier 1776', 'L’Atelier Bernard', 'Roger W. Smith', 'Kari Voutilainen',
  'Stepan Sarpaneva', 'Naoya Hida',
]);
const DUO_TYPES = new Set(['Petermann Bédat', 'Hazemann & Monnin', 'Kallinich Claeys']);

const BRAND_WORD = /watches|watchmakers|horology|atelier|manufacture|montres|uhren|&\s*co\b|cie\b|geneve|genève|studios?|&\s*fils|&\s*cie/i;

const SOLDOUT_NOISE = /^(earlier|first|the)\s+/i;
const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30 };

/** Amounts preceded by these are not usable current prices. */
const SKIP_LOOKBACK = /(approximately|approx\.?|auction|realized|phillips|christie'?s|sotheby'?s|launched|launch price|equivalent|anchor|est\.|achieved|asked|asking|sold for|hammer|pre-owned|dealer)\s*[:)]?\s*(?:at\s+)?[^\d]{0,12}$/i;

/** Amounts FOLLOWED by these (within 45 chars) are not usable current prices. */
const SKIP_AFTER = /^\s*[^)]{0,45}?\b(retail\s+in\s+\d{4}|at\s+phillips|phillips|christie'?s|sotheby'?s|auction|realized|achieved|asked\s|pre-owned|dealer\s+listing|dealer\s+price|hammer|presale\s+estimate|market\s+reference)/i;

/** Segments that are secondary-market commentary; never structured. */
const SECONDARY_SEGMENT = /\b(market\s+reference|auction|realized|achieved|asking\s+price|asked|sold\s+for|hammer\s+price|presale\s+estimate|dealer\s+listing|pre-owned\s+dealer)\b/i;

const TAX_WORDS = /\s*(,?\s*(excl\.?|excluding|incl\.?|including|before|net of|plus)\s+(tax(es)?|VAT|duties)(\s+and\s+(import\s+)?duties)?|before tax)\.?\s*/gi;

/** Domains that must never be emitted (hijacked / placeholder). */
const URL_BLACKLIST = /christopheclaret\.com|philippinedufour\.ch/i;

/* ------------------------------------------------------------------ */
/* Slug, scores, country                                               */
/* ------------------------------------------------------------------ */

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseScore(raw) {
  const r = raw.replace(/[–→]/g, '-').replace(/\s+/g, '');
  if (r.includes('-')) {
    const [lo, hi] = r.split('-').map(Number);
    return [lo, hi];
  }
  return [Number(r), Number(r)];
}

function resolveCountry(location) {
  const issues = [];
  let country;
  if (location.includes('/')) country = location.split('/').pop().trim();
  else if (location.includes(',')) country = location.split(',').pop().trim();
  else country = location.trim();
  country = country.replace(/\s*\(.*?\)\s*$/, '').trim();
  const key = country.toLowerCase();
  if (CITY_COUNTRY[key]) country = CITY_COUNTRY[key];
  else if (COUNTRY_NORM[key]) country = COUNTRY_NORM[key];
  else if (/\(/.test(country) || country.length > 30) issues.push(`unresolved country from location "${location}"`);
  return { country, issues };
}

/* ------------------------------------------------------------------ */
/* Price parsing                                                       */
/* ------------------------------------------------------------------ */

const AMOUNT_RE = /(USD|CHF|EUR|GBP|JPY|AUD|HKD)\s*([\d,]+(?:\.\d+)?)(?:\s*(million))?/g;

function* amountsIn(text) {
  for (const m of text.matchAll(AMOUNT_RE)) {
    yield { ccy: m[1], amount: parseFloat(m[2].replace(/,/g, '')) * (m[3] ? 1_000_000 : 1), index: m.index, raw: m[0] };
  }
}

function skipAmount(text, m) {
  const before = text.slice(Math.max(0, m.index - 60), m.index);
  if (SKIP_LOOKBACK.test(before)) return true;
  const after = text.slice(m.index + m.raw.length, m.index + m.raw.length + 50);
  if (SKIP_AFTER.test(after)) return true;
  // bare "(USD 25,500)" style conversion parenthetical right after a price
  if (/\s*\($/.test(before)) return true;
  return false;
}

function splitSegments(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function cleanName(raw) {
  let n = raw.replace(/\s+/g, ' ').trim();
  n = n.replace(/\s*[,:]\s*price\s+on\s+request\b.*$/i, '').replace(/\s*[,:]\s*starting\b.*$/i, '');
  n = n.replace(/^["'‘’]+|["'‘’]+$/g, '');
  n = n.replace(/[:;,.\s]+$/g, '');
  let prev;
  do {
    prev = n;
    n = n.replace(/\s+(publicly\s+described\s+as|described\s+as|made\s+to\s+order|available|priced|price|starting\s+from|from|approx\.?|approximately|about|around|as|a|an|the|was|is|of|at|for)$/i, '');
  } while (n !== prev);
  return n.trim();
}

function cleanVariantText(raw) {
  if (!raw) return undefined;
  let t = raw.replace(TAX_WORDS, ' ');
  t = t.replace(/\(\s*\)/g, ' ').replace(/[,;:.\s]+$/g, '').replace(/^[,;:.\s]+/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/^\((.*)\)$/, '$1').trim();
  t = t.replace(/\s*\([A-Za-zÀ-ÿ.\s]*$/, '').trim();
  if (/^(from|approx\.?|approximately|about|around)$/i.test(t)) return undefined;
  return t || undefined;
}

function productionFrom(text) {
  const prod = {};
  let note;
  // Per-year cadences are not series sizes: work on a copy with per-year
  // phrases removed when deriving series_total.
  const totalText = text.replace(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(pieces?|watches)\s+per\s+(year|month|reference)/gi, '');
  const tt = totalText.replace(/pieces?\s+per\s+reference\s+per\s+year/gi, '');
  let m = /(?:series\s+of|limited\s+to|edition\s+of)\s+(\d+)|(\d+)\s+pieces\b/i.exec(tt);
  if (m) prod.series_total = Number(m[1] ?? m[2]);
  const wm = /(?:(\d+)|(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))\s+pieces\b/i.exec(tt);
  if (!prod.series_total && wm) prod.series_total = wm[1] ? Number(wm[1]) : WORDNUM[wm[2].toLowerCase()];
  m = /(?:about\s+|approx\.?\s*)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:pieces?|watches)\s+per\s+year/i.exec(text);
  if (m) prod.per_year = /^\d+$/.test(m[1]) ? Number(m[1]) : WORDNUM[m[1].toLowerCase()];
  const plan = /(\d+)\s+pieces\s+planned/i.exec(text);
  if (plan) note = `${plan[1]} pieces planned`;
  const perRef = /(?:(\d+)|(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve))\s+pieces\s+per\s+reference\s+per\s+year/i.exec(text);
  if (perRef) {
    if (perRef) prod.per_year = perRef[1] ? Number(perRef[1]) : WORDNUM[perRef[2].toLowerCase()];
    note = note ? `${note}; pieces per reference per year` : 'pieces per reference per year';
  }
  const perMetal = /(\d+)\s+pieces\s+per\s+metal/i.exec(text);
  if (perMetal) note = note ? `${note}; ${perMetal[1]} pieces per metal` : `${perMetal[1]} pieces per metal`;
  const range = /(\d+)\s*[-–]\s*(\d+)\s+(?:watches|pieces)\s+(?:a|per)\s+(year|month)/i.exec(text);
  if (range) note = note ? `${note}; ${range[1]}-${range[2]} per ${range[3]}` : `${range[1]}-${range[2]} per ${range[3]}`;
  const total = /(\d+)\s+movements\s+total[^)]*/i.exec(text);
  if (total) note = note ? `${note}; ${total[0].trim()}` : total[0].trim();
  if (note) prod.note = note;
  return Object.keys(prod).length ? prod : undefined;
}

function yearFrom(text) {
  const m = /\b(20\d\d)\b/.exec(text);
  return m ? Number(m[1]) : undefined;
}

const NO_MODEL = /^(not\s+published|on\s+request|price\s+on\s+request|unknown|no\s+published\s+price|sold\s*out|to\s+follow|tbd|no\s+current\s+retail\b|bespoke\s+commissions?|orders\s+closed)\b/i;
const PROD_ONLY = /^((\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(pieces|movements)|series\s+of|edition\s+of|limited\s+to)/i;
const CONTINUATION_IGNORE = /^(pre-?order|orders|available|via\s+retailer|titanium\s+series\s+to\s+follow|platinum\s+(or|on)\b|figures\s+are|more\s+accessible|all\s+(excl\.?|incl\.?)\s|high\s+complications|unique\s+commissions)/i;

/**
 * Shared name/paren analysis: "(series of 12)" -> production,
 * "(8 pieces, 2024)" -> production + introduced, "(RRCC II, 50 pieces
 * per metal)" -> keep identity residue, else keep paren as part of name.
 */
function analyzeNameParens(nameRaw) {
  const years = {};
  let production;
  let name = cleanName(nameRaw.replace(/\s*\([^)]*\)\s*(?=\s*:?\s*$)/, ' '));
  const paren = /\(([^)]*)\)/.exec(nameRaw);
  if (paren) {
    const p = productionFrom(paren[1]);
    if (p) production = p;
    const y = yearFrom(paren[1]);
    if (y && (/pieces|series|edition|limited/i.test(paren[1]))) years.introduced = y;
    if (!p && !y) name = cleanName(nameRaw);
    else if (y && !p) years.introduced = y;
    else if (p) {
      const resid = paren[1]
        .replace(/,?\s*(\d+|(one|two|three|four|five|six|seven|eight|nine|ten))\s+pieces\s+per\s+\w+/i, '')
        .replace(/,?\s*(series\s+of|limited\s+to|edition\s+of)\s+\d+/i, '')
        .replace(/,?\s*\d+\s+pieces/i, '')
        .replace(/,?\s*(about\s+|approx\.?\s*)?\d+\s+(pieces|watches)\s+per\s+year/i, '')
        .replace(/,?\s*20\d\d/i, '')
        .trim().replace(/^,|,$/g, '').trim();
      if (resid) name = `${name} (${resid})`;
    }
  }
  return { name, production, years };
}

/**
 * Tail text after an amount: extract production/launch-year parens into
 * structured data and return the cleaned display text for the variant.
 */
function splitTail(raw) {
  let text = raw ?? '';
  const production = {};
  const years = {};
  text = text.replace(/\(([^()]*)\)/g, (whole, content) => {
    if (/(USD|CHF|EUR|GBP|JPY|AUD|HKD)/i.test(content)) return whole;
    const p = productionFrom(content);
    const y = yearFrom(content);
    if (p && /pieces?|series|edition|per\s+(year|month)|one\s+of\s+\d+/i.test(content)) {
      Object.assign(production, p);
      if (p.note) production.note = [production.note, p.note].filter(Boolean).join('; ');
      return ' ';
    }
    if (!p && y && /series|edition|pieces|launch/i.test(content)) {
      years.introduced = y;
      return ' ';
    }
    return whole;
  });
  return {
    text: cleanVariantText(text),
    production: Object.keys(production).length ? production : undefined,
    years,
  };
}

/**
 * Parse one maker's price text into { models, fallbackAmount, issues }.
 * Segments split on ';' (never inside parentheses). "Name: CUR amt" and
 * "Name CUR amt" become models; "Name: not published"/"Name: orders closed"
 * become minimal models; "Name sold out" lists become minimal sold_out
 * models; a bare-amount segment continues the previous model; parens that
 * declare "(edition sold out)" set status, while parens that tuck away an
 * earlier sold-out variant ("(original X EUR 24,000, sold out)") are lifted
 * into their own sold_out models. Auction/dealer/market-reference prices are
 * never structured and never become sort anchors.
 */
function parsePriceText(fullText) {
  const models = [];
  const issues = [];
  let lastModel = null;
  if (!fullText.trim()) return { models, fallbackAmount: undefined, issues };

  const wholeNoStructure = /\b(not\s+published|on\s+request|unknown|no\s+current\s+retail|tens\s+of\s+thousands)\b/i.test(fullText) && ![...amountsIn(fullText)].length;

  const work = splitSegments(fullText).map((seg) => ({ seg, forceSoldOut: false }));
  for (let wi = 0; wi < work.length; wi++) {
    let { seg, forceSoldOut } = work[wi];

    // Lift sold-out parens: "(edition sold out)" flags this model;
    // "(original Mondphase 1 EUR 24,000, sold out)" becomes its own forced
    // sold_out segment; any non-sold-out paren content stays in place.
    seg = seg.replace(/\(([^()]*)\)/g, (whole, content) => {
      if (!/(sold\s*out|all\s*sold)/i.test(content)) return whole;
      // "(three pieces, sold out)" / "(subscription sold out)": the whole paren
      // belongs to THIS model; production info in it stays parseable.
      const ownMarker = /^(.*?),?\s*(?:,\s*)?(sold\s*out|all\s*sold)\s*$/i.exec(content);
      if (ownMarker && (!ownMarker[1].trim() || /pieces?|series|edition|subscription/i.test(ownMarker[1]))) {
        forceSoldOut = true;
        const prefix = ownMarker[1].trim().replace(/,\s*$/, '');
        return /pieces|series|edition/i.test(prefix) ? ` (${prefix}) ` : ' ';
      }
      const keepers = [];
      for (const part of content.split(/\s*;\s*/)) {
        if (/(sold\s*out|all\s*sold)/i.test(part)) {
          const cleansed = part.replace(/,?\s*(sold\s*out|all\s*sold)[.\s]*/i, '').trim();
          if (cleansed) work.push({ seg: cleansed, forceSoldOut: true });
        } else if (part.trim()) keepers.push(part);
      }
      return keepers.length ? `(${keepers.join(', ')})` : ' ';
    });
    seg = seg.replace(/\s+/g, ' ').trim();

    const first = [...amountsIn(seg)][0];

    if (!first) {
      // production / availability continuation for the previous model
      const looksNamed = /^[^:;()]{2,80}:/.test(seg) || /\([^)]*\):/.test(seg);
      if (lastModel && !looksNamed && (PROD_ONLY.test(seg) || /movements\s+total/i.test(seg) || /\b(pieces?|edition|movements?)\b/i.test(seg))) {
        const p = productionFrom(seg) ?? { note: seg.replace(/\s*\((price\s+unpublished|[^)]*unpublished)\)\s*/i, '') };
        lastModel.production = { ...(lastModel.production ?? {}), ...p, note: [lastModel.production?.note, p.note].filter(Boolean).join('; ') || undefined };
        continue;
      }
      if (lastModel && CONTINUATION_IGNORE.test(seg) && !looksNamed) continue;
      if (SECONDARY_SEGMENT.test(seg) || /estimate|presale/i.test(seg)) continue;

      // "Name: not published" / "Name: on request" / "Name: orders closed ..." / "Name: sold out"
      const cm = /^([^:;]{2,80}):\s*(.+)$/.exec(seg);
      if (cm && NO_MODEL.test(cm[2])) {
        const { name: pname, production: pprod, years: pyears } = analyzeNameParens(cm[1]);
        if (pname.length > 1 && !NO_MODEL.test(pname)) {
          const status = forceSoldOut || /sold\s*out|all\s*sold/i.test(cm[2]) ? 'sold_out' : /orders\s+closed|discontinued/i.test(cm[2]) ? 'discontinued' : 'current';
          const model = { name: pname, ...(Object.keys(pyears).length ? { years: pyears } : {}), ...(pprod ? { production: pprod } : {}), status };
          models.push(model);
          lastModel = model;
          continue;
        }
      }

      // "earlier Paragon and Lutria sold out" -> minimal sold_out models
      if (forceSoldOut || /\bsold\s*out\b/i.test(seg)) {
        const names = seg.replace(/\bsold\s*out\b[.\s]*/i, '').replace(SOLDOUT_NOISE, '').trim();
        names.split(/\s+and\s+|\s*&\s*|,\s*/).map((x) => cleanName(x)).filter((x) => x.length > 1)
          .forEach((name) => {
            models.push({ name, status: 'sold_out' });
            lastModel = models[models.length - 1];
          });
        continue;
      }
      if (!NO_MODEL.test(seg) && !wholeNoStructure) issues.push(`unparsed price segment: "${seg}"`);
      continue;
    }

    // Secondary-market commentary is never a model.
    if (SECONDARY_SEGMENT.test(seg.slice(0, first.index))) continue;

    // Sanitize the working string: remove upcharge parens BEFORE finding
    // amounts so "+EUR 500" never spawns a standalone variant.
    let amountsSource = seg;
    const upchargeVariants = [];
    for (const up of seg.matchAll(/\(([^()]*\+(?:USD|CHF|EUR|GBP|JPY|AUD|HKD)[^()]*)\)/g)) {
      for (const part of up[1].split(',')) {
        const um = /^\s*(.*?)\s*\+(USD|CHF|EUR|GBP|JPY|AUD|HKD)\s*([\d,]+)/.exec(part);
        if (um) upchargeVariants.push({ name: um[1].trim(), ccy: um[2], up: Number(um[3].replace(/,/g, '')) });
      }
      amountsSource = amountsSource.replace(up[0], ' ');
    }

    const amounts = [...amountsIn(amountsSource)];
    const mainAmounts = amounts.filter((m, k) => k === 0 || !skipAmount(amountsSource, m));
    const nameRaw = amountsSource.slice(0, amounts[0].index);
    const soldOut = forceSoldOut || /\bsold\s*out\b/i.test(amountsSource.replace(/\([^()]*\)/g, ' '));

    const { name, production, years } = analyzeNameParens(nameRaw);
    const nameIsEmpty = !name || NO_MODEL.test(name) || name.length < 2;

    if (nameIsEmpty && lastModel) {
      for (const m of mainAmounts) {
        const end = nextIndex(amounts, m);
        const st = splitTail(amountsSource.slice(m.index + m.raw.length, end));
        if (st.production) lastModel.production = { ...(lastModel.production ?? {}), ...st.production };
        if (st.years.introduced && !lastModel.years?.introduced) lastModel.years = { ...(lastModel.years ?? {}), ...st.years };
        lastModel.prices = lastModel.prices ?? [];
        lastModel.prices.push({ ...(st.text ? { text: st.text } : {}), amount: m.amount, currency: m.ccy });
      }
      for (const uv of upchargeVariants) {
        const base = mainAmounts[0]?.amount;
        if (base == null) continue;
        lastModel.prices = lastModel.prices ?? [];
        lastModel.prices.push({ text: `${uv.name} (+${uv.ccy} ${uv.up.toLocaleString('en-GB')})`, amount: base + uv.up, currency: uv.ccy });
      }
      const p = productionFrom(amountsSource);
      if (p) lastModel.production = { ...(lastModel.production ?? {}), ...p };
      continue;
    }
    if (nameIsEmpty) {
      // "On request (published: X CHF n; Y CHF m)" -> parse the published list
      const pub = /published\s*:\s*(.+?)\s*\)?\s*$/.exec(seg);
      if (pub && [...amountsIn(pub[1])].length) {
        const inner = parsePriceText(pub[1].replace(/\)$/, ''));
        for (const md of inner.models) { models.push(md); lastModel = md; }
        issues.push(...inner.issues);
        continue;
      }
      const allSkipped = amounts.every((m) => skipAmount(amountsSource, m));
      if (!wholeNoStructure && !allSkipped) issues.push(`price segment without model name: "${seg}"`);
      continue;
    }

    const prices = [];
    const tailProd = {};
    for (const m of mainAmounts) {
      const end = nextIndex(amounts, m);
      const st = splitTail(amountsSource.slice(m.index + m.raw.length, end));
      if (st.production) Object.assign(tailProd, st.production);
      if (st.years.introduced && !years.introduced) years.introduced = st.years.introduced;
      prices.push({ ...(st.text ? { text: st.text } : {}), amount: m.amount, currency: m.ccy });
    }
    for (const uv of upchargeVariants) {
      const base = mainAmounts[0]?.amount;
      if (base == null) continue;
      prices.push({ text: `${uv.name} (+${uv.ccy} ${uv.up.toLocaleString('en-GB')})`, amount: base + uv.up, currency: uv.ccy });
    }

    if (!prices.length && amounts.length && amounts.every((m) => skipAmount(amountsSource, m))) {
      continue; // every amount was a secondary-market or estimate anchor
    }

    const prod2 = productionFrom(amountsSource);
    let mergedProd = prod2 ? { ...(production ?? {}), ...prod2 } : production;
    if (Object.keys(tailProd).length) mergedProd = { ...(mergedProd ?? {}), ...tailProd };
    const ly = /\(launched\s+(20\d\d)/i.exec(seg);
    if (ly && !years.introduced) years.introduced = Number(ly[1]);

    const model = {
      name,
      ...(Object.keys(years).length ? { years } : {}),
      ...(mergedProd ? { production: mergedProd } : {}),
      ...(prices.length ? { prices } : {}),
      status: soldOut ? 'sold_out' : 'current',
    };
    models.push(model);
    lastModel = model;
  }

  const seen = new Set();
  const unique = models.filter((md) => {
    const key = md.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let fallbackAmount;
  const hasCurrentAmount = unique.some((md) => md.status === 'current' && md.prices?.some((p) => p.amount != null));
  if (!hasCurrentAmount) {
    // Range pairs stay paired: if one side of "X to Y" is an estimate/auction/
    // conversion, the other side of that pair is not a usable anchor either.
    const unusableIdx = new Set();
    const all = [...amountsIn(fullText)];
    for (const m of all) {
      if (skipAmount(fullText, m)) {
        const after = fullText.slice(m.index + m.raw.length);
        const mate = /^\s*(?:to|–|-|\/)\s*(?:(?:USD|CHF|EUR|GBP|JPY|AUD|HKD)\s*)?([\d,]+(?:\.\d+)?)/i.exec(after);
        if (mate) unusableIdx.add(m.index + m.raw.length + mate[0].length - mate[1].length);
      }
    }
    const usable = all.filter((m) => !skipAmount(fullText, m) && !unusableIdx.has(m.index));
    if (usable.length) {
      const min = usable.reduce((a, b) => (a.amount <= b.amount ? a : b));
      fallbackAmount = { amount: min.amount, currency: min.ccy };
    }
  }
  return { models: unique, fallbackAmount, issues };

  function nextIndex(list, current) {
    const pos = list.findIndex((x) => x.index === current.index && x.raw === current.raw);
    const nxt = list[pos + 1];
    return nxt ? nxt.index : undefined;
  }
}


/* ------------------------------------------------------------------ */
/* Awards extraction                                                   */
/* ------------------------------------------------------------------ */

const AWARD_PATTERNS = [
  { name: 'Louis Vuitton Watch Prize', re: /Louis Vuitton (?:Watch\s+)?Prize/i },
  { name: 'HSNY Independent Watchmaker Grant', re: /HSNY\s+Independent\s+Watchmaker\s+Grant/i },
  { name: 'F.P. Journe Young Talent Competition', re: /F\.?\s*P\.?\s*Journe\s+Young\s+Talent\s+Competition/i },
  { name: 'GPHG', re: /GPHG\s+[A-ZÀ-Þa-zà-ÿ'’\-\s]*Prize/i },
  { name: 'Walter Lange Watchmaking Excellence Award', re: /Walter\s+Lange\s+Watchmaking\s+Excellence\s+Award/i },
];

function extractAwards(body) {
  const awards = [];
  const seen = new Set();
  for (const { name, re } of AWARD_PATTERNS) {
    for (const m of body.matchAll(new RegExp(re.source, 'gi'))) {
      const win = body.slice(Math.max(0, m.index - 160), m.index + m[0].length + 120);
      if (/\bdid\s+not\s+win\b/i.test(win)) continue;
      let result;
      if (/semi[\s-]?final/i.test(win)) result = 'semifinalist';
      else if (/finalist/i.test(win)) result = 'finalist';
      else if (/shortlist/i.test(win)) result = 'shortlisted';
      else if (/nomin/i.test(win)) result = 'nominee';
      else if (/candidat/i.test(win)) result = 'candidate';
      else if (/\b(winner|won|wins|laureate|recipient|received|awarded|took\s+home|securing|shared|granted|earned|bestowed)\b/i.test(win)) result = /grant/i.test(name) ? 'recipient' : 'winner';
      if (!result) continue;
      const localOff = m.index - Math.max(0, m.index - 160);
      let year;
      let best = Infinity;
      for (const y of win.matchAll(/(20\d\d)\s*[–\-/]\s*(?:20)?\d\d|(20\d\d)/g)) {
        const off = Math.abs(y.index - localOff);
        if (off < best) {
          best = off;
          year = Number(y[1] ?? y[2]);
        }
      }
      if (year == null) continue;
      const key = `${name}|${year}|${result}`;
      if (seen.has(key)) continue;
      seen.add(key);
      awards.push({ year, name, result });
    }
  }
  awards.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
  return awards;
}

/* ------------------------------------------------------------------ */
/* Record assembly                                                     */
/* ------------------------------------------------------------------ */

function pickUrl(...values) {
  for (const v of values) {
    if (!v) continue;
    const t = String(v).replace(/^Website:\s*/i, '').trim();
    if (/^none found$/i.test(t) || t === '') continue;
    const url = t.split(/\s+/)[0];
    if (URL_BLACKLIST.test(url)) continue;
    return url;
  }
  return undefined;
}

function pickIg(...values) {
  for (const v of values) {
    if (!v) continue;
    let t = String(v).replace(/^Instagram:\s*/i, '').trim();
    if (/^none found$/i.test(t) || t === '') continue;
    t = t.split(/\s+/)[0];
    t = t.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/\/$/, '').replace(/^@/, '');
    if (t) return t;
  }
  return undefined;
}

function inferTypeAndPeople(heading) {
  const meta = COMPOSITES[heading] ?? null;
  const out = {};
  const people = meta?.people ?? PEOPLE_EXTRA[heading] ?? undefined;
  if (people?.length) out.people = [...people];

  let type = meta?.type;
  if (!type && BRAND_TYPES.has(heading)) type = 'brand';
  if (!type && ATELIER_TYPES.has(heading)) type = 'atelier';
  if (!type && DUO_TYPES.has(heading)) type = 'duo';
  if (!type) {
    const simple = !/[\/&—]/.test(heading);
    const personish = simple && heading.split(/\s+/).length <= 4 &&
      heading.split(/\s+/).every((w) => /^[A-ZÀ-Þ]/.test(w) || /^[A-ZÀ-Þ]\./.test(w)) &&
      !BRAND_WORD.test(heading);
    if (simple && personish) {
      type = 'individual';
      out.people = out.people ?? [heading];
    } else {
      type = meta ? (people && people.length > 1 ? 'brand' : 'brand') : 'brand';
    }
  }
  out.type = type;

  const aliases = meta?.aliases ? [...meta.aliases] : undefined;
  const extra = ALIASES_EXTRA[heading];
  const all = [...new Set([...(aliases ?? []), ...(extra ?? [])])];
  if (all.length) out.aliases = all;
  return out;
}

const report = {
  makers: [],
  duplicates,
  issues: [],
  classifications: [],
  missing: { website: [], instagram: [], scores: [], location: [] },
  coverage: { agentsUnmatched: [], copyUnmatched: [], browserUnmatched: [] },
};

const slugs = new Map();

for (const [heading, block] of makers) {
  const key = norm(heading);
  const agent = agentByHeading.get(key);
  const copy = copyByHeading.get(key);
  const brows = browserByHeading.get(key);
  if (brows && !brows.matched_heading) void 0;

  const priceLine = block.lines.find((t) => /^\s*Estimated price:/i.test(t));
  const websiteLine = block.lines.find((t) => /^\s*Website:/i.test(t));
  const igLine = block.lines.find((t) => /^\s*Instagram:/i.test(t));

  const priceText = (agent?.price ?? copy?.estimated_price ?? priceLine ?? '')
    .replace(/^\s*Estimated price:\s*/i, '').trim();

  const website = pickUrl(brows?.website_url, agent?.website_url, copy?.website, websiteLine);
  const instagram = pickIg(brows?.instagram_url, agent?.instagram_url, copy?.instagram, igLine);

  let location;
  let country;
  let scores;
  if (block.locIdx !== -1) {
    const locLine = block.lines[block.locIdx];
    location = locLine.split('|')[0].trim();
    const sm = LOC_RE.exec(locLine);
    const [aLo, aHi] = parseScore(sm[1]);
    const [mLo, mHi] = parseScore(sm[2]);
    const asRange = (lo, hi) => (lo === hi ? lo : [lo, hi]);
    scores = { A: asRange(aLo, aHi), M: asRange(mLo, mHi) };
    const res = resolveCountry(location);
    country = res.country;
    report.issues.push(...res.issues.map((i) => `${heading}: ${i}`));
  }

  const { type, people, aliases } = inferTypeAndPeople(heading);

  const labelled = new Set([priceLine, websiteLine, igLine].filter(Boolean));
  const bodyParts = block.lines
    .filter((t, i) => i !== block.locIdx && t.trim() !== '' && t.trim() !== 'More information' && !labelled.has(t))
    .map((t) => t.replace(/\v+/g, '\n'));
  let body = bodyParts.join('\n\n').trim();
  if (!body && copy?.body?.length) body = copy.body.join('\n\n').trim();

  const { models, fallbackAmount, issues: priceIssues } = parsePriceText(priceText || '');
  report.issues.push(...priceIssues.map((i) => `${heading}: ${i}`));

  const movementMaking = scores
    ? (Array.isArray(scores.M) ? scores.M[0] : scores.M) >= 5
      ? 'full_inhouse'
      : (Array.isArray(scores.M) ? scores.M[0] : scores.M) >= 3
        ? 'partial'
        : 'finished_ebauche'
    : undefined;
  const added = agent ? ADDED_AGENT : TODAY;
  const dup = duplicates.find((d) => d.heading === heading);

  const record = {};
  record.slug = slugify(heading);
  if (slugs.has(record.slug)) report.issues.push(`slug collision: ${heading} -> ${record.slug} (already used by ${slugs.get(record.slug)})`);
  slugs.set(record.slug, heading);
  record.name = heading;
  record.type = type;
  if (people?.length) record.people = people;
  if (aliases?.length) record.aliases = aliases;
  record.tier = block.tier;
  if (dup && dup.dropped === 'A' && dup.kept === 'S') {
    record.tier_note = 'also listed in Tier A (established masters); canonical placement is Tier S (modern canon)';
  } else if (dup) {
    record.tier_note = `duplicate heading in source document; canonical placement Tier ${dup.kept}`;
  }
  if (scores) record.scores = scores;
  record.status = 'active';
  if (location) record.location = location;
  if (country) record.country = country;
  if (movementMaking) record.movement_making = movementMaking;
  if (website) record.website = website;
  if (instagram) record.instagram = instagram;
  if (priceText) record.price = { text: priceText, ...(fallbackAmount ?? {}) };
  if (models.length) record.models = models;
  const awards = extractAwards(body);
  if (awards.length) record.awards = awards;
  record.last_verified = TODAY;
  record.added = added;
  record.updated = TODAY;
  record.doc_heading = heading;
  if (body) record.body = body;

  if (!website) report.missing.website.push(heading);
  if (!instagram) report.missing.instagram.push(heading);
  if (!scores) report.missing.scores.push(heading);
  if (!location) report.missing.location.push(heading);

  report.makers.push(record);
  report.classifications.push(`${heading}  ->  ${type}${people?.length ? ' | people: ' + people.join(', ') : ''}${aliases?.length ? ' | aliases: ' + aliases.join(', ') : ''}`);
}

report.makers.sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.name.localeCompare(b.name));

/* ------------------------------------------------------------------ */
/* Coverage QA: every source row must land on a doc maker              */
/* ------------------------------------------------------------------ */

const docKeys = new Set([...makers.keys()].map((h) => norm(h)));
for (const a of agents) if (!docKeys.has(norm(a.heading))) report.coverage.agentsUnmatched.push(a.heading);
for (const c of [...copyC, ...copyD]) if (!docKeys.has(norm(c.heading))) report.coverage.copyUnmatched.push(c.heading);
for (const b of browser) {
  if (!docKeys.has(norm(b.heading))) report.coverage.browserUnmatched.push(b.heading);
}

/* ------------------------------------------------------------------ */
/* Write YAML files                                                    */
/* ------------------------------------------------------------------ */

const tre = { S: 0, A: 0, B: 0, C: 0, D: 0, E: 0 };
let withModels = 0;
let fallbackOnly = 0;
let noPrice = 0;

const keep = new Set();
for (const m of report.makers) {
  tre[m.tier]++;
  if (m.models?.some((x) => x.status === 'current' && x.prices?.length)) withModels++;
  else if (m.price?.text) fallbackOnly++;
  else noPrice++;
  keep.add(`${m.slug}.yaml`);
  const y = dump(m, { lineWidth: -1, noRefs: true, quotingType: "'" });
  writeFileSync(join(OUT_DIR, `${m.slug}.yaml`), y, 'utf8');
}

const stale = readdirSync(OUT_DIR).filter((f) => f.endsWith('.yaml') && !keep.has(f));
for (const f of stale) unlinkSync(join(OUT_DIR, f));

const tierLine = TIER_ORDER.map((t) => `${t} ${tre[t]}`).join(', ');
const list = (k) => `${report.missing[k].length} -> ${report.missing[k].join(' | ')}`;
console.log(`makers written: ${report.makers.length}  (tiers ${tierLine})`);
console.log(`structured current-model prices: ${withModels} | fallback text prices: ${fallbackOnly} | no price: ${noPrice}`);
console.log(`missing website   (${list('website')})`);
console.log(`missing instagram (${list('instagram')})`);
console.log(`missing scores    (${list('scores')})`);
console.log(`missing location  (${list('location')})`);
console.log(`duplicates resolved: ${report.duplicates.map((d) => `${d.heading} (canonical Tier ${d.kept}, Tier ${d.dropped} placement collapsed)`).join('; ') || 'none'}`);
console.log(`coverage: agents unmatched ${report.coverage.agentsUnmatched.length} [${report.coverage.agentsUnmatched.join(', ')}] | copy unmatched ${report.coverage.copyUnmatched.length} [${report.coverage.copyUnmatched.join(', ')}] | browser unmatched ${report.coverage.browserUnmatched.length} [${report.coverage.browserUnmatched.join(', ')}]`);
console.log(`stale yaml removed: ${stale.length}`);
console.log(`issues (${report.issues.length}):`);
for (const i of report.issues) console.log(`  - ${i}`);

writeFileSync('/tmp/seed-report.json', JSON.stringify({ tierCounts: tre, withModels, fallbackOnly, noPrice, classifications: report.classifications }, null, 2));

export { parsePriceText, productionFrom, analyzeNameParens, splitSegments };
