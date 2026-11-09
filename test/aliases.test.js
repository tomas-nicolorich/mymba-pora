import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset } from '../scripts/build-dataset.js';
import { suggestionLabels } from '../src/labels.js';

const cfkItem = (title) => ({
  title: { rendered: title }, link: `https://cfk.example/${title}`, modified: '2025-01-01T00:00:00',
  acf: { cruelty_free: 'Yes' },
});
const lbItem = (id, name) => ({ BrandId: id, TradingName: name });
const base = (cfk, lb, aliases) => ({
  generatedAt: 'x',
  cfk: { items: cfk, fetchedAt: 't', sourceUrl: 'u' },
  lb: { items: lb, fetchedAt: 't', sourceUrl: 'u' },
  aliases,
});
const names = (d) => d.brands.map((b) => b.name).sort();

test('"same brand" Alias merges entries with different names across Sources', () => {
  const { dataset, warnings } = buildDataset(base(
    [cfkItem('Dr. Bronners')], [lbItem(1, 'Dr Bronner Magic Soaps')],
    { same_brand: [[{ source: 'cfk', name: 'Dr. Bronners' }, { source: 'lb', name: 'Dr Bronner Magic Soaps' }]] },
  ));
  assert.equal(dataset.brands.length, 1);
  assert.equal(dataset.brands[0].name, 'Dr. Bronners');
  assert.ok(dataset.brands[0].sources.cfk && dataset.brands[0].sources.lb);
  assert.deepEqual(warnings, []);
});

test('"ignore" Alias drops the Source entry, keeping other Sources of the brand', () => {
  const { dataset } = buildDataset(base(
    [cfkItem('Junk'), cfkItem('Keep')], [lbItem(1, 'Keep'), lbItem(2, 'Junk')],
    { ignore: [{ source: 'lb', name: 'Junk' }] },
  ));
  const junk = dataset.brands.find((b) => b.name === 'Junk');
  assert.ok(junk.sources.cfk && !junk.sources.lb);
  const only = buildDataset(base([cfkItem('Keep')], [lbItem(2, 'Junk'), lbItem(1, 'Keep')], { ignore: [{ source: 'lb', name: 'Junk' }] }));
  assert.deepEqual(names(only.dataset), ['Keep']);
});

test('an Alias naming a missing entry warns and does not crash', () => {
  const { dataset, warnings } = buildDataset(base(
    [cfkItem('Alpha')], [lbItem(1, 'Beta')],
    {
      ignore: [{ source: 'lb', name: 'Nope' }],
      same_brand: [[{ source: 'cfk', name: 'Alpha' }, { source: 'lb', name: 'Ghost' }]],
    },
  ));
  assert.equal(dataset.brands.length, 2);
  assert.equal(warnings.filter((w) => /Alias/.test(w)).length, 2);
  assert.ok(warnings.some((w) => w.includes('Ghost')));
});

test('same-source collisions warn and keep both entries as separate brands', () => {
  const { dataset, warnings } = buildDataset(base(
    [cfkItem('Grace &amp;amp; Stella'), cfkItem('grace and stella')], [lbItem(1, 'Zed'), lbItem(2, 'ZED')], {},
  ));
  assert.equal(dataset.brands.filter((b) => b.key === 'graceandstella').length, 2);
  assert.equal(dataset.brands.filter((b) => b.key === 'zed').length, 2);
  assert.ok(warnings.some((w) => /Cruelty-Free Kitty/.test(w) && w.includes('Grace & Stella')));
  assert.ok(!warnings.some((w) => w.includes('&amp;')));
  assert.ok(warnings.some((w) => /Leaping Bunny/.test(w)));
});

test('colliding suggestions are labeled with their original name and Source', () => {
  const a = { name: 'Grace & Stella', key: 'k', sources: { cfk: {} } };
  const b = { name: 'grace and stella', key: 'k', sources: { lb: {} } };
  const c = { name: 'Other', key: 'o', sources: { cfk: {} } };
  assert.deepEqual(suggestionLabels([a, b, c]), [
    'Grace & Stella (Cruelty-Free Kitty)', 'grace and stella (Leaping Bunny)', 'Other',
  ]);
});
