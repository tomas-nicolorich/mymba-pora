import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataset } from '../scripts/build-dataset.js';
import { computeVerdict } from '../src/verdict.js';

const read = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const LB_URL = 'https://www.leapingbunny.org/api/Query';
const input = {
  generatedAt: '2026-11-09T13:00:00Z',
  cfk: { items: read('cfk-raw.json'), parents: read('cfk-parents-raw.json'), fetchedAt: '2026-11-09T12:00:00Z', sourceUrl: 'https://cfk.example/api' },
  lb: { items: read('lb-raw.json'), fetchedAt: '2026-11-09T12:30:00Z', sourceUrl: LB_URL },
};
const byName = (dataset, n) => dataset.brands.find((b) => b.name === n);

test('LB Source entry keeps only the allowed fields', () => {
  const { dataset } = buildDataset(input);
  assert.deepEqual(byName(dataset, 'Australian Glow').sources.lb, {
    brand_id: 1719,
    name: 'Australian Glow',
    trading_name: 'Australian Glow Pty Ltd',
    is_dirty_parent: true,
    link: 'https://www.leapingbunny.org/ShopBrandDetail?BrandId=1719',
    fetched_at: '2026-11-09T12:30:00Z',
    source_url: LB_URL,
  });
  const text = JSON.stringify(dataset);
  assert.ok(!text.includes('dropped'));
});

test('matches CFK and LB on the LB display name (CompanyName), not the legal TradingName', () => {
  const { dataset } = buildDataset(input);
  // "Frederic Malle" matches by display name even though the legal TradingName differs; CFK name wins for display.
  const fm = byName(dataset, 'Frederic Malle');
  assert.ok(fm.sources.cfk && fm.sources.lb);
  // LB-only brand keeps its TradingName as display name.
  const ph7 = byName(dataset, 'ph7 natura beauty inc');
  assert.ok(ph7.sources.lb && !ph7.sources.cfk);
  assert.equal(dataset.brands.length, 4 + 1); // 4 CFK + ph7
  assert.deepEqual(dataset.counts, { cfk: 4, lb: 3 });
});

test('merged brands feed the Verdict', () => {
  const { dataset } = buildDataset(input);
  const fm = computeVerdict(byName(dataset, 'Frederic Malle'));
  assert.equal(fm.verdict, 'certified');
  // CFK disagreement, three CFK parent Notes (testing, grey area, neutral), CFK China Uncertain,
  // only in the Leaping Bunny directory
  assert.equal(fm.notes.length, 6);
  const ag = computeVerdict(byName(dataset, 'Australian Glow'));
  assert.equal(ag.verdict, 'certified');
  assert.deepEqual(ag.notes, [
    'Su empresa matriz no está certificada por Leaping Bunny.',
    'Solo figura en el directorio de Leaping Bunny, no en el de Cruelty Free International.',
  ]);
});

test('an empty LB response is a validation error', () => {
  assert.throws(() => buildDataset({ ...input, lb: { ...input.lb, items: [] } }), /Leaping Bunny/);
});

test('Unilever-style case: a legal-entity TradingName does not certify the brand it names', () => {
  const cfkUnilever = { ...input.cfk.items[0], id: 999, title: { rendered: 'Unilever' }, link: 'https://cfk.example/unilever/' };
  const lb = { ...input.lb, items: [{ BrandId: 2075, TradingName: 'Unilever', CompanyName: 'Schmidt&#39;s', IsDirtyParent: 'Yes' }] };
  const { dataset } = buildDataset({ ...input, cfk: { ...input.cfk, items: [cfkUnilever] }, lb });
  const unilever = byName(dataset, 'Unilever');
  assert.ok(unilever.sources.cfk && !unilever.sources.lb, 'Unilever is not on Leaping Bunny');
  const schmidts = byName(dataset, "Schmidt's");
  assert.equal(schmidts.sources.lb.name, "Schmidt's");
  assert.equal(schmidts.sources.lb.trading_name, 'Unilever');
  assert.ok(!schmidts.sources.cfk);
});

test('falls back to TradingName when the display name is missing', () => {
  const lb = { ...input.lb, items: [{ BrandId: 5, TradingName: 'Fallback Co', CompanyName: '  ', IsDirtyParent: null }] };
  const { dataset } = buildDataset({ ...input, lb });
  assert.equal(byName(dataset, 'Fallback Co').sources.lb.name, 'Fallback Co');
});

test('without lb input the dataset is CFK-only', () => {
  const { lb, ...cfkOnly } = input;
  const { dataset } = buildDataset(cfkOnly);
  assert.deepEqual(dataset.counts, { cfk: 4 });
});
