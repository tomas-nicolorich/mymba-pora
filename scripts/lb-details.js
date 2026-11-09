// Leaping Bunny detail pages: "Certified since <year>" and "Products Sold" exist only there, so they are cached
// in data/lb-details.json (BrandId -> { year, categories, fetched_at }) and refreshed a little on every run.
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeEntities } from '../src/normalize.js';
import { LB_DETAIL_URL } from './build-dataset.js';
import { USER_AGENT, DELAY_MS } from './fetch-lb.js';

export const REFRESH_OLDEST = 100;
export const CACHE_URL = new URL('../data/lb-details.json', import.meta.url);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A missing brand returns HTTP 200 without the brand block, so "no year" is detected by absence.
export function parseDetail(html) {
  const y = /<span class="leftTick">\s*Certified since (\d{4})\s*<\/span>/.exec(html);
  const block = /<span class="Label"[^>]*>\s*Products Sold\s*<\/span>\s*<div class="PanelFieldValue">\s*<div><span>([\s\S]*?)<\/span><\/div>/.exec(html);
  const categories = block
    ? block[1]
        .split(/<br\s*\/?>/i)
        .map((s) => decodeEntities(s.split(':-')[0].replace(/<[^>]*>/g, '')).trim())
        .filter(Boolean)
    : [];
  return { year: y ? Number(y[1]) : null, categories };
}

// New BrandIds first, then the `oldest` least recently fetched cache entries still listed.
export function selectRefresh(brandIds, cache, oldest = REFRESH_OLDEST) {
  const fresh = brandIds.filter((id) => !(id in cache));
  const stale = brandIds
    .filter((id) => id in cache)
    .sort((a, b) => String(cache[a].fetched_at).localeCompare(String(cache[b].fetched_at)))
    .slice(0, oldest);
  return [...fresh, ...stale];
}

// Returns a new cache. A failed request keeps whatever was cached (or nothing, so it retries next run) and warns.
export async function refreshDetails({
  ids,
  cache,
  fetchImpl = fetch,
  delayMs = DELAY_MS,
  now = () => new Date().toISOString(),
  warn = () => {},
  log = () => {},
}) {
  const next = { ...cache };
  for (const [i, id] of ids.entries()) {
    if (i > 0) await sleep(delayMs);
    try {
      const res = await fetchImpl(`${LB_DETAIL_URL}${id}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { year, categories } = parseDetail(await res.text());
      if (year == null) warn(`Leaping Bunny BrandId ${id}: no "Certified since" year on its detail page`);
      next[id] = { year, categories, fetched_at: now() };
    } catch (e) {
      warn(`Leaping Bunny BrandId ${id}: detail page failed (${e.message})`);
    }
    if ((i + 1) % 50 === 0) log(`Leaping Bunny details ${i + 1}/${ids.length}`);
  }
  return next;
}

export function loadCache(url = CACHE_URL) {
  try {
    return JSON.parse(readFileSync(url, 'utf8'));
  } catch {
    return {};
  }
}

export function saveCache(cache, url = CACHE_URL) {
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => Number(a) - Number(b)));
  writeFileSync(url, JSON.stringify(sorted, null, 1) + '\n');
}
