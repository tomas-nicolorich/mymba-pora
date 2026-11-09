import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLeapingBunny, parseFormToken } from '../scripts/fetch-lb.js';

const PAGE = '<form><input type="hidden" name="__RequestVerificationToken" id="__RequestVerificationToken" value="form-tok_en-1" /></form>';

function fakeFetch(pages) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url: String(url), headers: opts.headers ?? {} });
    if (String(url).includes('Brands.aspx')) {
      return new Response(PAGE, {
        status: 200,
        headers: [['set-cookie', 'ASP.NET_SessionId=sess1; path=/; HttpOnly'], ['set-cookie', '__RequestVerificationToken=cookie-tok; path=/; HttpOnly']],
      });
    }
    const offset = Number(new URL(url).searchParams.get('offset'));
    const page = pages[offset];
    return Response.json({
      Items: { $values: page.items },
      TotalCount: 3,
      HasNext: page.next != null,
      NextOffset: page.next,
    });
  };
  return { impl, calls };
}

test('parseFormToken reads the anti-forgery form value', () => {
  assert.equal(parseFormToken(PAGE), 'form-tok_en-1');
  assert.throws(() => parseFormToken('<html></html>'), /token/i);
});

test('fetches every page one at a time with the session cookie and the page-issued token', async () => {
  const { impl, calls } = fakeFetch({
    0: { items: [{ BrandId: 1, TradingName: 'A' }, { BrandId: 2, TradingName: 'B' }], next: 2 },
    2: { items: [{ BrandId: 3, TradingName: 'C' }], next: null },
  });
  const res = await fetchLeapingBunny({ fetchImpl: impl, delayMs: 0, limit: 2 });
  assert.deepEqual(res.items.map((i) => i.BrandId), [1, 2, 3]);
  assert.equal(res.sourceUrl, 'https://www.leapingbunny.org/api/Query');
  assert.equal(calls.length, 3);
  const api = calls[1];
  assert.equal(api.headers.RequestVerificationToken, 'form-tok_en-1');
  assert.match(api.headers.Cookie, /ASP\.NET_SessionId=sess1/);
  assert.match(api.headers.Cookie, /__RequestVerificationToken=cookie-tok/);
  const u = new URL(api.url);
  assert.equal(u.searchParams.get('QueryName'), '$/_LeapingBunny/Shopping Guide/List of Brands');
  assert.equal(u.searchParams.get('limit'), '2');
  assert.equal(new URL(calls[2].url).searchParams.get('offset'), '2');
});

test('maxItems stops early (for a small verification run)', async () => {
  const { impl, calls } = fakeFetch({ 0: { items: [{ BrandId: 1 }, { BrandId: 2 }], next: 2 } });
  const res = await fetchLeapingBunny({ fetchImpl: impl, delayMs: 0, limit: 2, maxItems: 2 });
  assert.equal(res.items.length, 2);
  assert.equal(calls.length, 2);
});

test('an HTTP error is reported', async () => {
  const impl = async (url) => (String(url).includes('Brands.aspx') ? new Response(PAGE) : new Response('no', { status: 401 }));
  await assert.rejects(fetchLeapingBunny({ fetchImpl: impl, delayMs: 0 }), /401/);
});
