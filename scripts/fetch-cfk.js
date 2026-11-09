// Network layer for Cruelty-Free Kitty: polite, sequential, paginated. Not unit-tested (see spec).
import { SOURCE_LABELS } from '../src/labels.js';
import { DELAY_MS, fetchWordPressCollection } from './http.js';

export const CFK_ENDPOINT = 'https://www.crueltyfreekitty.com/wp-json/wp/v2/cfk_brand';

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

export const fetchCfk = ({ fetchImpl, delayMs = DELAY_MS, log } = {}) =>
  fetchWordPressCollection({ endpoint: CFK_ENDPOINT, fields: FIELDS, label: SOURCE_LABELS.cfk, fetchImpl, delayMs, log });
