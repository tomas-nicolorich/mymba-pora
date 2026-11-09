// Dataset build: pure function from raw Source responses to a dataset (or a thrown validation error).
import { decodeEntities, normalizeName } from '../src/normalize.js';
import { SOURCE_LABELS } from '../src/labels.js';

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

function cfkEntry(item, { fetchedAt, sourceUrl }) {
  const acf = item.acf ?? {};
  const entry = {
    name: decodeEntities(item.title?.rendered),
    link: item.link,
    modified: item.modified,
    cruelty_free: acf.cruelty_free ?? '',
  };
  for (const key of FLAG_KEYS) entry[key] = acf[key] ?? '';
  entry.parent_companies = names(acf.parent_company);
  entry.parent_company_doesnt_test = names(acf.attributes).includes(PARENT_OK_ATTRIBUTE);
  entry.certifications = names(acf.certifications);
  entry.fetched_at = fetchedAt;
  entry.source_url = sourceUrl;
  return entry;
}

export const LB_DETAIL_URL = 'https://www.leapingbunny.org/ShopBrandDetail?BrandId=';

function lbEntry(item, { fetchedAt, sourceUrl }) {
  const entry = {
    brand_id: item.BrandId,
    trading_name: decodeEntities(item.TradingName),
    is_dirty_parent: item.IsDirtyParent === 'Yes',
  };
  if (Array.isArray(item.categories) && item.categories.length) entry.categories = item.categories;
  entry.link = `${LB_DETAIL_URL}${item.BrandId}`;
  entry.fetched_at = fetchedAt;
  entry.source_url = sourceUrl;
  return entry;
}

// Attach Leaping Bunny entries by normalized TradingName only (never CompanyName).
function mergeLeapingBunny(brands, lb, warnings) {
  if (!lb?.items?.length) throw new Error('Leaping Bunny returned no brands');
  const byKey = new Map();
  for (const b of brands) if (!byKey.has(b.key)) byKey.set(b.key, b);
  for (const item of lb.items) {
    const entry = lbEntry(item, lb);
    const key = normalizeName(entry.trading_name);
    const target = byKey.get(key);
    if (target && !target.sources.lb) {
      target.sources.lb = entry;
    } else {
      if (target) warnings.push(`${SOURCE_LABELS.lb} collision after normalization: "${entry.trading_name}" (key "${key}")`);
      const brand = { name: entry.trading_name, key, sources: { lb: entry } };
      brands.push(brand);
      if (!byKey.has(key)) byKey.set(key, brand);
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

// Attach Cruelty Free International entries by normalized name (it has no categories).
function mergeCfi(brands, cfi, warnings) {
  if (!cfi?.items?.length) throw new Error('Cruelty Free International returned no brands');
  const byKey = new Map();
  for (const b of brands) if (!byKey.has(b.key)) byKey.set(b.key, b);
  for (const item of cfi.items) {
    const entry = cfiEntry(item, cfi);
    const key = normalizeName(entry.name);
    const target = byKey.get(key);
    if (target && !target.sources.cfi) {
      target.sources.cfi = entry;
    } else {
      if (target) warnings.push(`${SOURCE_LABELS.cfi} collision after normalization: "${entry.name}" (key "${key}")`);
      const brand = { name: entry.name, key, sources: { cfi: entry } };
      brands.push(brand);
      if (!byKey.has(key)) byKey.set(key, brand);
    }
  }
}

// Generic over Sources: every Source entry has its display name in `name` (cfk, cfi) or `trading_name` (lb).
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

export function buildDataset({ generatedAt, cfk, lb, cfi, aliases }) {
  if (!cfk?.items?.length) throw new Error('CFK returned no brands');
  const warnings = [];
  const brands = [];
  const seen = new Map();
  const unknownStatuses = new Set();

  for (const item of cfk.items) {
    const entry = cfkEntry(item, cfk);
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
    warnings.push(`CFK has unknown cruelty_free values: ${[...unknownStatuses].map((s) => JSON.stringify(s)).join(', ')}`);
  }

  const counts = { cfk: brands.length };
  if (lb) {
    mergeLeapingBunny(brands, lb, warnings);
    counts.lb = lb.items.length;
  }
  if (cfi) {
    mergeCfi(brands, cfi, warnings);
    counts.cfi = cfi.items.length;
  }
  applyAliases(brands, aliases, warnings);
  const sortLink = (b) => b.sources.cfk?.link ?? b.sources.lb?.link ?? b.sources.cfi?.link ?? '';
  brands.sort((a, b) => a.key.localeCompare(b.key) || sortLink(a).localeCompare(sortLink(b)));
  return { dataset: { generated_at: generatedAt, counts, brands }, warnings };
}
