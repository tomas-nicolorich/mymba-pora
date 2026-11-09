// Network layer for Cruelty-Free Kitty: polite, sequential, paginated. Not unit-tested (see spec).
// Fetches the brands, then CFK's parent company list, which carries CFK's own status for each parent.
import { SOURCE_LABELS } from '../src/labels.js';
import { DELAY_MS, fetchWordPressCollection, sleep } from './http.js';

export const CFK_ENDPOINT = 'https://www.crueltyfreekitty.com/wp-json/wp/v2/cfk_brand';
export const CFK_PARENTS_ENDPOINT = 'https://www.crueltyfreekitty.com/wp-json/wp/v2/cfk_parent_company';

const ACF_FIELDS = [
  'cruelty_free',
  'finished_products_tested_on_animals',
  'ingredients_tested_on_animals',
  'suppliers_test_on_animals',
  'third_party_animal_testing',
  'sold_in_mainland_china',
  'parent_company',
  'attributes',
  'certifications',
].map((f) => `acf.${f}`);
const FIELDS = ['id', 'link', 'title', 'modified', ...ACF_FIELDS].join(',');
const PARENT_FIELDS = ['id', 'slug', 'name', 'acf.cruelty_free'].join(',');

export async function fetchCfk({ fetchImpl, delayMs = DELAY_MS, log } = {}) {
  const label = SOURCE_LABELS.cfk;
  const brands = await fetchWordPressCollection({ endpoint: CFK_ENDPOINT, fields: FIELDS, label, fetchImpl, delayMs, log });
  await sleep(delayMs);
  const parents = await fetchWordPressCollection({
    endpoint: CFK_PARENTS_ENDPOINT,
    fields: PARENT_FIELDS,
    label: `${label} parent companies`,
    noun: 'parent companies',
    fetchImpl,
    delayMs,
    log,
  });
  return { ...brands, parents: parents.items };
}
