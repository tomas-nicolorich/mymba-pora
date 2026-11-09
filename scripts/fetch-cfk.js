// Network layer for Cruelty-Free Kitty: polite, sequential, paginated. Not unit-tested (see spec).
export const CFK_ENDPOINT = 'https://www.crueltyfreekitty.com/wp-json/wp/v2/cfk_brand';
export const USER_AGENT = 'mymba-pora-bot/0.1';
export const DELAY_MS = 2000;
const PER_PAGE = 100;

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchCfk({ fetchImpl = fetch, delayMs = DELAY_MS, log = () => {} } = {}) {
  const items = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) await sleep(delayMs);
    const url = `${CFK_ENDPOINT}?per_page=${PER_PAGE}&page=${page}&_fields=${FIELDS}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`CFK page ${page}: HTTP ${res.status}`);
    totalPages = Number(res.headers.get('X-WP-TotalPages')) || totalPages;
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error(`CFK page ${page}: unexpected response`);
    items.push(...batch);
    log(`CFK page ${page}/${totalPages}: ${batch.length} brands`);
  }
  return { items, fetchedAt: new Date().toISOString(), sourceUrl: CFK_ENDPOINT };
}
