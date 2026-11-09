// Network layer for Leaping Bunny (iMIS): same flow as its Brands page. Polite, sequential, paginated.
import { USER_AGENT, DELAY_MS, sleep } from './http.js';

export const LB_PAGE = 'https://www.leapingbunny.org/Web/Shopping-Guide/Brands.aspx';
export const LB_ENDPOINT = 'https://www.leapingbunny.org/api/Query';
export const LB_QUERY = '$/_LeapingBunny/Shopping Guide/List of Brands';
export const LB_DETAIL_URL = 'https://www.leapingbunny.org/ShopBrandDetail?BrandId=';
const PAGE_SIZE = 50; // what the site's own page uses

export function parseFormToken(html) {
  const m = /id="__RequestVerificationToken"\s+value="([^"]*)"/.exec(html);
  if (!m) throw new Error('Leaping Bunny: anti-forgery token not found on the Brands page');
  return m[1];
}

function cookieHeader(res) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

export async function fetchLeapingBunny({
  fetchImpl = fetch,
  delayMs = DELAY_MS,
  limit = PAGE_SIZE,
  maxItems = Infinity,
  log = () => {},
} = {}) {
  const page = await fetchImpl(LB_PAGE, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } });
  if (!page.ok) throw new Error(`Leaping Bunny Brands page: HTTP ${page.status}`);
  const cookie = cookieHeader(page);
  const token = parseFormToken(await page.text());
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json', Cookie: cookie, RequestVerificationToken: token };

  const items = [];
  let offset = 0;
  for (;;) {
    await sleep(delayMs);
    const qs = new URLSearchParams({ QueryName: LB_QUERY, limit: String(limit), offset: String(offset) });
    const res = await fetchImpl(`${LB_ENDPOINT}?${qs}`, { headers });
    if (!res.ok) throw new Error(`Leaping Bunny offset ${offset}: HTTP ${res.status}`);
    const body = await res.json();
    const batch = body?.Items?.$values;
    if (!Array.isArray(batch)) throw new Error(`Leaping Bunny offset ${offset}: unexpected response`);
    items.push(...batch);
    log(`Leaping Bunny ${items.length}/${body.TotalCount ?? '?'}`);
    if (!body.HasNext || items.length >= maxItems || !(body.NextOffset > offset)) break;
    offset = body.NextOffset;
  }
  return { items: items.slice(0, maxItems), fetchedAt: new Date().toISOString(), sourceUrl: LB_ENDPOINT };
}
