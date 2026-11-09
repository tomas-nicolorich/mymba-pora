import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchCfi, CFI_ENDPOINT } from '../scripts/fetch-cfi.js';

function fakeFetch(pages, totalPages = pages.length) {
  const calls = [];
  const impl = async (url, opts = {}) => {
    calls.push({ url: String(url), headers: opts.headers ?? {} });
    const page = Number(new URL(url).searchParams.get('page'));
    return Response.json(pages[page - 1], { headers: { 'X-WP-TotalPages': String(totalPages) } });
  };
  return { impl, calls };
}

test('fetches every page sequentially with a client name and only the needed fields', async () => {
  const { impl, calls } = fakeFetch([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
  const res = await fetchCfi({ fetchImpl: impl, delayMs: 0 });
  assert.deepEqual(res.items.map((i) => i.id), [1, 2, 3]);
  assert.equal(res.sourceUrl, CFI_ENDPOINT);
  assert.match(CFI_ENDPOINT, /^https:\/\/www\.crueltyfreeinternational\.org\/wp-json\/wp\/v2\/approved_bra_dir_ltg$/);
  assert.equal(calls.length, 2);
  const u = new URL(calls[0].url);
  assert.equal(u.searchParams.get('per_page'), '100');
  assert.equal(u.searchParams.get('_fields'), 'id,link,title,date');
  assert.match(calls[0].headers['User-Agent'], /mymba-pora/);
  assert.equal(new URL(calls[1].url).searchParams.get('page'), '2');
});

test('an HTTP error or a non-array body is reported', async () => {
  await assert.rejects(fetchCfi({ fetchImpl: async () => new Response('no', { status: 503 }), delayMs: 0 }), /503/);
  await assert.rejects(fetchCfi({ fetchImpl: async () => Response.json({ code: 'x' }), delayMs: 0 }), /unexpected/);
});
