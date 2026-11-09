import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDataset } from '../scripts/build-dataset.js';
import { computeVerdict } from '../src/verdict.js';
import { normalizeName } from '../src/normalize.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/cfk-raw.json', import.meta.url), 'utf8'));
const parentsRaw = JSON.parse(readFileSync(new URL('./fixtures/cfk-parents-raw.json', import.meta.url), 'utf8'));
const input = {
  generatedAt: '2026-11-09T13:00:00Z',
  cfk: {
    items: raw,
    parents: parentsRaw,
    fetchedAt: '2026-11-09T12:00:00Z',
    sourceUrl: 'https://www.crueltyfreekitty.com/wp-json/wp/v2/cfk_brand',
  },
};

test('builds a dataset with generated_at, per-Source counts and brands', () => {
  const { dataset } = buildDataset(input);
  assert.equal(dataset.generated_at, '2026-11-09T13:00:00Z');
  assert.deepEqual(dataset.counts, { cfk: 4 });
  assert.equal(dataset.brands.length, 4);
});

test('brand has display name (entities decoded), normalized key and a CFK Source entry', () => {
  const { dataset } = buildDataset(input);
  const b = dataset.brands.find((x) => x.key === normalizeName("Chasin' Rabbits"));
  assert.equal(b.name, 'CHASIN’ RABBITS');
  assert.ok(b.sources.cfk);
});

test('CFK Source entry keeps exactly the allowed fields', () => {
  const { dataset } = buildDataset(input);
  const e = dataset.brands[0].sources.cfk;
  assert.deepEqual(e, {
    name: 'Australian Glow',
    link: 'https://www.crueltyfreekitty.com/brands/australian-glow/',
    modified: '2026-03-31T19:19:49',
    cruelty_free: 'Yes',
    finished_products_tested_on_animals: '',
    ingredients_tested_on_animals: '',
    suppliers_test_on_animals: '',
    third_party_animal_testing: '',
    sold_in_mainland_china: '',
    parent_companies: [],
    parent_company_doesnt_test: true,
    certifications: ['PETA'],
    fetched_at: '2026-11-09T12:00:00Z',
    source_url: 'https://www.crueltyfreekitty.com/wp-json/wp/v2/cfk_brand',
  });
  const text = JSON.stringify(dataset);
  assert.ok(!text.includes('affiliate'));
  assert.ok(!text.includes('description that must not'));
  assert.ok(!text.includes('yoast'));
});

test('parent companies are decoded and carry CFK\'s own status; mixed types (false/null/missing) become empty arrays', () => {
  const { dataset } = buildDataset(input);
  const fm = dataset.brands.find((b) => b.name === 'Frederic Malle').sources.cfk;
  assert.deepEqual(fm.parent_companies, [
    { name: 'Estée Lauder', cruelty_free: 'No' },
    { name: 'PDC Wellness & Personal Care', cruelty_free: 'Grey Area' },
    // Matched by term id although the collection spells the name with a plain apostrophe.
    { name: 'L’Oréal', cruelty_free: 'No' },
    // No term id: matched by slug.
    { name: 'Yes Co', cruelty_free: 'Yes' },
    // In the collection without a status, and not in the collection at all.
    { name: 'No Status Inc', cruelty_free: '' },
    { name: 'Gone Corp', cruelty_free: '' },
  ]);
  assert.deepEqual(fm.certifications, []);
  assert.equal(fm.parent_company_doesnt_test, false);
  const mystery = dataset.brands[3].sources.cfk;
  assert.deepEqual(mystery.parent_companies, []);
  assert.equal(mystery.finished_products_tested_on_animals, '');
});

test('keeps Leaping Bunny certification tag from CFK', () => {
  const { dataset } = buildDataset(input);
  const chasin = dataset.brands.find((b) => b.name.startsWith('CHASIN'));
  assert.deepEqual(chasin.sources.cfk.certifications, ['Leaping Bunny', 'PETA']);
});

test('unknown cruelty_free values produce a warning, not a failure', () => {
  const { warnings } = buildDataset(input);
  assert.ok(warnings.some((w) => w.includes('MLM')));
});

test('same-named CFK entries stay separate brands and warn about the collision', () => {
  const dup = { ...raw[0], id: 999, link: 'https://www.crueltyfreekitty.com/brands/australian-glow-2/' };
  const { dataset, warnings } = buildDataset({ ...input, cfk: { ...input.cfk, items: [raw[0], dup] } });
  assert.equal(dataset.brands.length, 2);
  assert.ok(warnings.some((w) => /collision/i.test(w)));
});

test('an empty CFK response is a validation error', () => {
  assert.throws(() => buildDataset({ ...input, cfk: { ...input.cfk, items: [] } }), /Cruelty-Free Kitty returned no brands/);
});

test('a parent company missing from the parent collection warns once, naming it', () => {
  const { warnings } = buildDataset(input);
  const gone = warnings.filter((w) => w.includes('Gone Corp'));
  assert.equal(gone.length, 1);
  assert.match(gone[0], /parent compan/i);
  assert.ok(!warnings.some((w) => w.includes('No Status Inc')));
});

test('a missing or empty parent company collection is a validation error', () => {
  for (const parents of [undefined, []]) {
    assert.throws(
      () => buildDataset({ ...input, cfk: { ...input.cfk, parents } }),
      /Cruelty-Free Kitty returned no parent companies/,
    );
  }
});

test('dataset brands feed the Verdict directly', () => {
  const { dataset } = buildDataset(input);
  const byName = (n) => dataset.brands.find((b) => b.name === n);
  assert.equal(computeVerdict(byName('Australian Glow')).verdict, 'verified');
  assert.equal(computeVerdict(byName('Frederic Malle')).verdict, 'not_cruelty_free');
  assert.equal(computeVerdict(byName('CHASIN’ RABBITS')).verdict, 'grey_area');
});

test('parent Notes follow each parent\'s own CFK status end to end', () => {
  const { dataset } = buildDataset(input);
  const notes = computeVerdict(dataset.brands.find((b) => b.name === 'Frederic Malle')).notes;
  assert.ok(notes.includes('Su empresa matriz (Estée Lauder y L’Oréal) testea en animales, según Cruelty-Free Kitty.'));
  assert.ok(notes.includes('Su empresa matriz (PDC Wellness & Personal Care) está en zona gris, según Cruelty-Free Kitty.'));
  assert.ok(notes.includes('Tiene una empresa matriz: Yes Co, No Status Inc y Gone Corp.'));
});
