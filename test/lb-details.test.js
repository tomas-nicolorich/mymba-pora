import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDetail, selectRefresh, refreshDetails } from '../scripts/lb-details.js';
import { buildDataset } from '../scripts/build-dataset.js';

const html = (f) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8');
const read = (f) => JSON.parse(html(f));

test('parseDetail reads the certification year and the Products Sold categories', () => {
  assert.deepEqual(parseDetail(html('lb-detail-1719.html')), {
    year: 2019,
    categories: ['BABY CARE', 'BATH & SHOWER CARE', 'FACE CARE', 'HAND & BODY CARE', 'HAIR CARE', "MEN'S CARE", 'SUN CARE'],
  });
});

test('parseDetail gives a blank year for a missing brand page (HTTP 200, no brand block)', () => {
  assert.deepEqual(parseDetail(html('lb-detail-missing.html')), { year: null, categories: [] });
});

test('selectRefresh picks new BrandIds plus the oldest cache entries', () => {
  const cache = {
    1: { year: 2001, fetched_at: '2026-01-03T00:00:00Z' },
    2: { year: 2002, fetched_at: '2026-01-01T00:00:00Z' },
    3: { year: 2003, fetched_at: '2026-01-02T00:00:00Z' },
    9: { year: 1999, fetched_at: '2025-01-01T00:00:00Z' }, // no longer listed: ignored
  };
  assert.deepEqual(selectRefresh([1, 2, 3, 4, 5], cache, 2), [4, 5, 2, 3]);
  assert.deepEqual(selectRefresh([1, 2], {}, 100), [1, 2]);
});

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url) => {
    const id = Number(new URL(url).searchParams.get('BrandId'));
    calls.push(id);
    const r = responses[id];
    if (r === 'throw') throw new Error('network down');
    return new Response(r.body ?? '', { status: r.status ?? 200 });
  };
  return { impl, calls };
}

test('refreshDetails fetches only the selected ids and tolerates failures', async () => {
  const warnings = [];
  const { impl, calls } = fakeFetch({
    1719: { body: html('lb-detail-1719.html') },
    5: { body: html('lb-detail-missing.html') },
    6: { status: 500 },
    7: 'throw',
  });
  const old = { 8: { year: 2010, categories: [], fetched_at: '2026-01-01T00:00:00Z' } };
  const cache = await refreshDetails({
    ids: [1719, 5, 6, 7],
    cache: old,
    fetchImpl: impl,
    delayMs: 0,
    now: () => '2026-11-09T00:00:00Z',
    warn: (m) => warnings.push(m),
  });
  assert.deepEqual(calls, [1719, 5, 6, 7]);
  assert.equal(cache[1719].year, 2019);
  assert.equal(cache[1719].fetched_at, '2026-11-09T00:00:00Z');
  assert.equal(cache[5].year, null, 'no year: blank, still cached');
  assert.ok(!(6 in cache) && !(7 in cache), 'failed requests are not cached, so they retry next run');
  assert.deepEqual(cache[8], old[8], 'untouched entries survive');
  assert.equal(warnings.length, 3);
});

test('a failed refresh keeps the previous cached year', async () => {
  const { impl } = fakeFetch({ 1: { status: 503 } });
  const old = { 1: { year: 2015, categories: ['X'], fetched_at: '2026-01-01T00:00:00Z' } };
  const cache = await refreshDetails({ ids: [1], cache: old, fetchImpl: impl, delayMs: 0, warn: () => {} });
  assert.deepEqual(cache[1], old[1]);
});

test('a failed fetch with no previous value stays blank: nothing cached, no certified_since on the entry', async () => {
  const lbRaw = read('lb-raw.json');
  const id = lbRaw[0].BrandId;
  const { impl } = fakeFetch({ [id]: { status: 503 } });
  const cache = await refreshDetails({ ids: [id], cache: {}, fetchImpl: impl, delayMs: 0, warn: () => {} });
  assert.ok(!(id in cache));
  const { dataset } = buildDataset({
    generatedAt: '2026-11-09T13:00:00Z',
    cfk: { items: read('cfk-raw.json'), parents: read('cfk-parents-raw.json'), fetchedAt: '2026-11-09T12:00:00Z', sourceUrl: 'https://cfk.example/api' },
    lb: { items: lbRaw, fetchedAt: '2026-11-09T12:30:00Z', sourceUrl: 'https://lb.example/api' },
    lbDetails: cache,
  });
  const entry = dataset.brands.map((b) => b.sources.lb).find((e) => e?.brand_id === id);
  assert.ok(entry && !('certified_since' in entry));
});

test('buildDataset puts certified_since and cached categories on the LB entry; blank when unknown', () => {
  const { dataset } = buildDataset({
    generatedAt: '2026-11-09T13:00:00Z',
    cfk: { items: read('cfk-raw.json'), parents: read('cfk-parents-raw.json'), fetchedAt: '2026-11-09T12:00:00Z', sourceUrl: 'https://cfk.example/api' },
    lb: { items: read('lb-raw.json'), fetchedAt: '2026-11-09T12:30:00Z', sourceUrl: 'https://lb.example/api' },
    lbDetails: { 1719: { year: 2019, categories: ['FACE CARE'], fetched_at: '2026-11-09T00:00:00Z' } },
  });
  const lbs = dataset.brands.map((b) => b.sources.lb).filter(Boolean);
  const babo = lbs.find((e) => e.brand_id === 1719);
  assert.equal(babo.certified_since, 2019);
  assert.deepEqual(babo.categories, ['FACE CARE']);
  const other = lbs.find((e) => e.brand_id !== 1719);
  assert.ok(!('certified_since' in other));
});
