// Node-only helpers shared by the Source fetchers: polite client identity and delay, and the
// sequential WordPress REST pagination loop used by Cruelty-Free Kitty and Cruelty Free International.
export const USER_AGENT = 'mymba-pora-bot/0.1';
export const DELAY_MS = 2000;
const PER_PAGE = 100;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetches every page of a WordPress REST collection, one request at a time, `delayMs` apart.
// `label` names the Source in log and error messages; `noun` names what each item is in the log.
export async function fetchWordPressCollection({ endpoint, fields, label, noun = 'brands', fetchImpl = fetch, delayMs = DELAY_MS, log = () => {} }) {
  const items = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) await sleep(delayMs);
    const url = `${endpoint}?per_page=${PER_PAGE}&page=${page}&_fields=${fields}`;
    const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${label} page ${page}: HTTP ${res.status}`);
    totalPages = Number(res.headers.get('X-WP-TotalPages')) || totalPages;
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error(`${label} page ${page}: unexpected response`);
    items.push(...batch);
    log(`${label} page ${page}/${totalPages}: ${batch.length} ${noun}`);
  }
  return { items, fetchedAt: new Date().toISOString(), sourceUrl: endpoint };
}
