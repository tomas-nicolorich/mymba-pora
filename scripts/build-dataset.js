// Dataset build: pure function from raw Source responses to a dataset (or a thrown validation error).
import { decodeEntities, normalizeName } from '../src/normalize.js';

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
      if (target) warnings.push(`Leaping Bunny collision after normalization: "${entry.trading_name}" (key "${key}")`);
      const brand = { name: entry.trading_name, key, sources: { lb: entry } };
      brands.push(brand);
      if (!byKey.has(key)) byKey.set(key, brand);
    }
  }
}

export function buildDataset({ generatedAt, cfk, lb }) {
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
      warnings.push(`CFK collision after normalization: "${seen.get(key)}" and "${entry.name}" (key "${key}")`);
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
  const sortLink = (b) => b.sources.cfk?.link ?? b.sources.lb?.link ?? '';
  brands.sort((a, b) => a.key.localeCompare(b.key) || sortLink(a).localeCompare(sortLink(b)));
  return { dataset: { generated_at: generatedAt, counts, brands }, warnings };
}
