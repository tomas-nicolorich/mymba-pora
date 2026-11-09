// Dataset build: pure function from raw Source responses to a dataset (or a thrown validation error).
import { decodeEntities, normalizeName } from '../src/normalize.js';
import { SOURCES, SOURCE_LABELS } from '../src/labels.js';
import { LB_DETAIL_URL } from './fetch-lb.js';

const KNOWN_STATUSES = new Set(['Yes', 'No', 'Grey Area']);
const FLAG_KEYS = [
  'finished_products_tested_on_animals',
  'ingredients_tested_on_animals',
  'suppliers_test_on_animals',
  'third_party_animal_testing',
  'sold_in_mainland_china',
];
const PARENT_OK_ATTRIBUTE = "Parent company doesn't test on animals";

const names = (value) =>
  Array.isArray(value) ? value.map((t) => decodeEntities(typeof t === 'string' ? t : t?.name)).filter(Boolean) : [];

// CFK's own status for each parent company, looked up by taxonomy term id, then slug (never by name,
// whose spelling can differ between a brand's field and the collection). Built from the raw
// `cfk_parent_company` collection; each item is { id, slug, name, acf: { cruelty_free } | false }.
function parentStatusLookup(parents) {
  const byId = new Map();
  const bySlug = new Map();
  for (const p of parents) {
    const status = typeof p?.acf?.cruelty_free === 'string' ? p.acf.cruelty_free : '';
    if (p?.id != null) byId.set(p.id, status);
    if (p?.slug) bySlug.set(p.slug, status);
  }
  // Returns the status ('' when CFK gives none), or undefined when the parent isn't in the collection.
  return (term) => (byId.has(term?.term_id) ? byId.get(term.term_id) : bySlug.get(term?.slug));
}

function cfkParents(value, statusOf, missing) {
  if (!Array.isArray(value)) return [];
  return value
    .map((term) => {
      const name = decodeEntities(typeof term === 'string' ? term : term?.name);
      if (!name) return null;
      const status = statusOf(term);
      if (status === undefined) missing.add(name);
      return { name, cruelty_free: status ?? '' };
    })
    .filter(Boolean);
}

function cfkEntry(item, { fetchedAt, sourceUrl }, statusOf, missingParents) {
  const acf = item.acf ?? {};
  const entry = {
    name: decodeEntities(item.title?.rendered),
    link: item.link,
    modified: item.modified,
    cruelty_free: acf.cruelty_free ?? '',
  };
  for (const key of FLAG_KEYS) entry[key] = acf[key] ?? '';
  entry.parent_companies = cfkParents(acf.parent_company, statusOf, missingParents);
  entry.parent_company_doesnt_test = names(acf.attributes).includes(PARENT_OK_ATTRIBUTE);
  entry.certifications = names(acf.certifications);
  entry.fetched_at = fetchedAt;
  entry.source_url = sourceUrl;
  return entry;
}

function lbEntry(item, { fetchedAt, sourceUrl }, detail) {
  const tradingName = decodeEntities(item.TradingName);
  const entry = {
    brand_id: item.BrandId,
    // CompanyName is what leapingbunny.org displays (TradingName is the legal entity and can name another brand).
    name: decodeEntities(item.CompanyName).trim() || tradingName,
    trading_name: tradingName,
    is_dirty_parent: item.IsDirtyParent === 'Yes',
  };
  const categories = detail?.categories?.length ? detail.categories : item.categories;
  if (Array.isArray(categories) && categories.length) entry.categories = categories;
  if (detail?.year) entry.certified_since = detail.year;
  entry.link = `${LB_DETAIL_URL}${item.BrandId}`;
  entry.fetched_at = fetchedAt;
  entry.source_url = sourceUrl;
  return entry;
}

// Attach one Source's entries to `brands` by normalized entry name (for Leaping Bunny that is the display name,
// never the legal TradingName). `raw` is the fetched { items, fetchedAt, sourceUrl }; `toEntry(item, raw)` builds an entry.
// An entry whose key is already held by a brand with an entry from the same Source becomes a separate brand and warns.
function mergeSource(brands, key, raw, toEntry, warnings) {
  if (!raw?.items?.length) throw new Error(`${SOURCE_LABELS[key]} returned no brands`);
  const byKey = new Map();
  for (const b of brands) if (!byKey.has(b.key)) byKey.set(b.key, b);
  for (const item of raw.items) {
    const entry = toEntry(item, raw);
    const nameKey = normalizeName(entry.name);
    const target = byKey.get(nameKey);
    if (target && !target.sources[key]) {
      target.sources[key] = entry;
    } else {
      if (target) warnings.push(`${SOURCE_LABELS[key]} collision after normalization: "${entry.name}" (key "${nameKey}")`);
      const brand = { name: entry.name, key: nameKey, sources: { [key]: entry } };
      brands.push(brand);
      if (!byKey.has(nameKey)) byKey.set(nameKey, brand);
    }
  }
}

function cfiEntry(item, { fetchedAt, sourceUrl }) {
  return {
    name: decodeEntities(item.title?.rendered),
    link: item.link,
    date: item.date,
    fetched_at: fetchedAt,
    source_url: sourceUrl,
  };
}

// Generic over Sources: every Source entry has its display name in `name` (cfk, cfi, lb; `trading_name` only as a legacy fallback).
const entryName = (entry) => entry.name ?? entry.trading_name ?? '';

// Find the brand holding the Source entry an Alias refers to: exact name first, then normalized name.
function findEntry(brands, ref) {
  if (!ref || typeof ref.source !== 'string' || typeof ref.name !== 'string') return null;
  const holders = brands.filter((b) => b.sources[ref.source]);
  const exact = holders.find((b) => entryName(b.sources[ref.source]) === ref.name);
  if (exact) return exact;
  const key = normalizeName(ref.name);
  return holders.find((b) => normalizeName(entryName(b.sources[ref.source])) === key) ?? null;
}

const describeRef = (ref) => `${SOURCE_LABELS[ref?.source] ?? ref?.source} "${ref?.name}"`;

// Apply the hand-edited Alias file: `ignore` drops Source entries, `same_brand` merges entries into one brand.
function applyAliases(brands, aliases, warnings) {
  const prune = (brand) => {
    const i = brands.indexOf(brand);
    if (i >= 0 && !Object.keys(brand.sources).length) brands.splice(i, 1);
  };
  for (const ref of aliases?.ignore ?? []) {
    const brand = findEntry(brands, ref);
    if (!brand) {
      warnings.push(`Alias ignore refers to a missing entry: ${describeRef(ref)}`);
      continue;
    }
    delete brand.sources[ref.source];
    prune(brand);
  }
  for (const group of aliases?.same_brand ?? []) {
    const found = [];
    for (const ref of group) {
      const brand = findEntry(brands, ref);
      if (brand) found.push({ ref, brand });
      else warnings.push(`Alias same_brand refers to a missing entry: ${describeRef(ref)}`);
    }
    if (found.length < 2) continue;
    const target = found[0].brand;
    for (const { ref, brand } of found.slice(1)) {
      if (brand === target) continue;
      if (target.sources[ref.source]) {
        warnings.push(`Alias same_brand can't merge ${describeRef(ref)}: that brand already has an entry from the same Source`);
        continue;
      }
      target.sources[ref.source] = brand.sources[ref.source];
      delete brand.sources[ref.source];
      prune(brand);
    }
  }
}

export function buildDataset({ generatedAt, cfk, lb, cfi, lbDetails = {}, aliases }) {
  if (!cfk?.items?.length) throw new Error(`${SOURCE_LABELS.cfk} returned no brands`);
  if (!cfk.parents?.length) throw new Error(`${SOURCE_LABELS.cfk} returned no parent companies`);
  const warnings = [];
  const brands = [];
  const seen = new Map();
  const unknownStatuses = new Set();
  const statusOf = parentStatusLookup(cfk.parents);
  const missingParents = new Set();

  for (const item of cfk.items) {
    const entry = cfkEntry(item, cfk, statusOf, missingParents);
    const key = normalizeName(entry.name);
    if (!KNOWN_STATUSES.has(entry.cruelty_free)) unknownStatuses.add(entry.cruelty_free);
    if (seen.has(key)) {
      warnings.push(`${SOURCE_LABELS.cfk} collision after normalization: "${seen.get(key)}" and "${entry.name}" (key "${key}")`);
    } else {
      seen.set(key, entry.name);
    }
    brands.push({ name: entry.name, key, sources: { cfk: entry } });
  }
  if (unknownStatuses.size) {
    warnings.push(`${SOURCE_LABELS.cfk} has unknown cruelty_free values: ${[...unknownStatuses].map((s) => JSON.stringify(s)).join(', ')}`);
  }

  if (missingParents.size) {
    warnings.push(
      `${SOURCE_LABELS.cfk} parent companies not in its parent company list (shown without a status): ${[...missingParents].map((n) => JSON.stringify(n)).join(', ')}`,
    );
  }

  const counts = { cfk: brands.length };
  if (lb) {
    mergeSource(brands, 'lb', lb, (item, raw) => lbEntry(item, raw, lbDetails[item.BrandId]), warnings);
    counts.lb = lb.items.length;
  }
  if (cfi) {
    mergeSource(brands, 'cfi', cfi, cfiEntry, warnings);
    counts.cfi = cfi.items.length;
  }
  applyAliases(brands, aliases, warnings);
  const sortLink = (b) => SOURCES.map((s) => b.sources[s.key]?.link).find(Boolean) ?? '';
  brands.sort((a, b) => a.key.localeCompare(b.key) || sortLink(a).localeCompare(sortLink(b)));
  return { dataset: { generated_at: generatedAt, counts, brands }, warnings };
}
