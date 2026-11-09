import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataset } from '../scripts/build-dataset.js';
import { computeVerdict } from '../src/verdict.js';

const read = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const CFI_URL = 'https://www.crueltyfreeinternational.org/wp-json/wp/v2/approved_bra_dir_ltg';
const input = {
  generatedAt: '2026-11-09T13:00:00Z',
  cfk: { items: read('cfk-raw.json'), parents: read('cfk-parents-raw.json'), fetchedAt: '2026-11-09T12:00:00Z', sourceUrl: 'https://cfk.example/api' },
  lb: { items: read('lb-raw.json'), fetchedAt: '2026-11-09T12:30:00Z', sourceUrl: 'https://www.leapingbunny.org/api/Query' },
  cfi: { items: read('cfi-raw.json'), fetchedAt: '2026-11-09T12:45:00Z', sourceUrl: CFI_URL },
};
const byName = (dataset, n) => dataset.brands.find((b) => b.name === n);

test('CFI Source entry keeps only name, link, date, fetched_at and source URL', () => {
  const { dataset } = buildDataset(input);
  assert.deepEqual(byName(dataset, 'Mo & Marine').sources.cfi, {
    name: 'Mo & Marine',
    link: 'https://www.crueltyfreeinternational.org/approved-brands/listing/mo-marine/',
    date: '2026-09-25T08:01:58',
    fetched_at: '2026-11-09T12:45:00Z',
    source_url: CFI_URL,
  });
  const text = JSON.stringify(dataset);
  assert.ok(!text.includes('dropped') && !text.includes('yoast'));
});

test('CFI matches CFK and LB on the normalized name; a CFI-only brand is Certified', () => {
  const { dataset } = buildDataset(input);
  const fm = byName(dataset, 'Frederic Malle');
  assert.ok(fm.sources.cfk && fm.sources.lb && fm.sources.cfi);
  const mo = byName(dataset, 'Mo & Marine');
  assert.ok(mo.sources.cfi && !mo.sources.cfk && !mo.sources.lb);
  assert.equal(computeVerdict(mo).verdict, 'certified');
  assert.deepEqual(dataset.counts, { cfk: 4, lb: 3, cfi: 3 });
  assert.equal(dataset.brands.length, 4 + 1 + 1); // 4 CFK + ph7 (LB+CFI) + Mo & Marine
});

test('listed in both directories gives no directory Note; only LB gives one', () => {
  const { dataset } = buildDataset(input);
  const ph7 = computeVerdict(byName(dataset, 'ph7 natura beauty inc'));
  assert.deepEqual(ph7.notes, []);
  const ag = computeVerdict(byName(dataset, 'Australian Glow'));
  assert.ok(ag.notes.some((n) => n.startsWith('Solo figura en el directorio de Leaping Bunny')));
});

test('an empty CFI response is a validation error', () => {
  assert.throws(() => buildDataset({ ...input, cfi: { ...input.cfi, items: [] } }), /Cruelty Free International/);
});

test('without cfi input the dataset has no CFI entries', () => {
  const { cfi, ...rest } = input;
  const { dataset } = buildDataset(rest);
  assert.deepEqual(dataset.counts, { cfk: 4, lb: 3 });
});
