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

export function buildDataset({ generatedAt, cfk }) {
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

  brands.sort((a, b) => a.key.localeCompare(b.key) || a.sources.cfk.link.localeCompare(b.sources.cfk.link));
  return { dataset: { generated_at: generatedAt, counts: { cfk: brands.length }, brands }, warnings };
}
