import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataset } from '../scripts/build-dataset.js';
import { computeVerdict } from '../src/verdict.js';

const read = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const LB_URL = 'https://www.leapingbunny.org/api/Query';
const input = {
  generatedAt: '2026-11-09T13:00:00Z',
  cfk: { items: read('cfk-raw.json'), fetchedAt: '2026-11-09T12:00:00Z', sourceUrl: 'https://cfk.example/api' },
  lb: { items: read('lb-raw.json'), fetchedAt: '2026-11-09T12:30:00Z', sourceUrl: LB_URL },
};
const byName = (dataset, n) => dataset.brands.find((b) => b.name === n);

test('LB Source entry keeps only the allowed fields', () => {
  const { dataset } = buildDataset(input);
  assert.deepEqual(byName(dataset, 'Australian Glow').sources.lb, {
    brand_id: 1719,
    trading_name: 'Australian Glow',
    is_dirty_parent: true,
    link: 'https://www.leapingbunny.org/ShopBrandDetail?BrandId=1719',
    fetched_at: '2026-11-09T12:30:00Z',
    source_url: LB_URL,
  });
  const text = JSON.stringify(dataset);
  assert.ok(!text.includes('Some Other Co'), 'CompanyName is never kept');
  assert.ok(!text.includes('dropped'));
});

test('matches CFK and LB on the normalized TradingName only, never CompanyName', () => {
  const { dataset } = buildDataset(input);
  // "Frederic Malle" matches by TradingName even though CompanyName differs; CFK name wins for display.
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
  // CFK disagreement, CFK parent, CFK China Uncertain, only in the Leaping Bunny directory
  assert.equal(fm.notes.length, 4);
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

test('without lb input the dataset is CFK-only', () => {
  const { lb, ...cfkOnly } = input;
  const { dataset } = buildDataset(cfkOnly);
  assert.deepEqual(dataset.counts, { cfk: 4 });
});
