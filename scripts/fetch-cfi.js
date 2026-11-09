// Network layer for the Cruelty Free International approved-brands directory (WordPress REST): polite, sequential, paginated.
export const CFI_ENDPOINT = 'https://www.crueltyfreeinternational.org/wp-json/wp/v2/approved_bra_dir_ltg';
export const USER_AGENT = 'mymba-pora-bot/0.1';
export const DELAY_MS = 2000;
const PER_PAGE = 100;
const FIELDS = 'id,link,title,date'; // the directory exposes no categories

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchCfi({ fetchImpl = fetch, delayMs = DELAY_MS, log = () => {} } = {}) {
  const items = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) await sleep(delayMs);
    const url = `${CFI_ENDPOINT}?per_page=${PER_PAGE}&page=${page}&_fields=${FIELDS}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Cruelty Free International page ${page}: HTTP ${res.status}`);
    totalPages = Number(res.headers.get('X-WP-TotalPages')) || totalPages;
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error(`Cruelty Free International page ${page}: unexpected response`);
    items.push(...batch);
    log(`Cruelty Free International page ${page}/${totalPages}: ${batch.length} brands`);
  }
  return { items, fetchedAt: new Date().toISOString(), sourceUrl: CFI_ENDPOINT };
}
