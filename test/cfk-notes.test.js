import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict } from '../src/verdict.js';

const cfk = (over = {}) => ({
  name: 'X',
  link: 'https://www.crueltyfreekitty.com/brands/x/',
  modified: '2026-03-31T19:19:49',
  cruelty_free: 'Yes',
  finished_products_tested_on_animals: '',
  ingredients_tested_on_animals: '',
  suppliers_test_on_animals: '',
  third_party_animal_testing: '',
  sold_in_mainland_china: '',
  parent_companies: [],
  parent_company_doesnt_test: false,
  certifications: [],
  fetched_at: '2026-11-09T12:00:00Z',
  source_url: 'https://www.crueltyfreekitty.com/wp-json/wp/v2/cfk_brand?page=1',
  ...over,
});
const brand = (entry) => ({ name: 'X', key: 'x', sources: entry ? { cfk: entry } : {} });

const PARENT_NOTE = (n) => `Su empresa matriz (${n}) testea en animales, según Cruelty-Free Kitty.`;
const CHINA_YES_NOTE =
  'Cruelty-Free Kitty indica que se vende en tiendas físicas de China continental. Es un punto discutido: si la marca está certificada por Leaping Bunny, esa certificación debería pesar más.';
const CHINA_UNCERTAIN_NOTE = 'Cruelty-Free Kitty no pudo confirmar si se vende en China continental.';

test('parent note: parent present and "doesn\'t test" attribute absent names the parent', () => {
  const v = computeVerdict(brand(cfk({ parent_companies: ['Estée Lauder'] })));
  assert.deepEqual(v.notes, [PARENT_NOTE('Estée Lauder')]);
});

test('parent note: several parents are all named', () => {
  const v = computeVerdict(brand(cfk({ parent_companies: ['A', 'B'] })));
  assert.deepEqual(v.notes, [PARENT_NOTE('A y B')]);
});

test('parent note: absent when the "doesn\'t test" attribute is present', () => {
  const v = computeVerdict(brand(cfk({ parent_companies: ['A'], parent_company_doesnt_test: true })));
  assert.deepEqual(v.notes, []);
});

test('parent note: absent when there is no parent', () => {
  assert.deepEqual(computeVerdict(brand(cfk({ parent_companies: [] }))).notes, []);
});

test('China: Yes shows the contested-point note, including "Yes (bypasses ...)"', () => {
  for (const value of ['Yes', 'Yes (bypasses animal testing)']) {
    assert.deepEqual(computeVerdict(brand(cfk({ sold_in_mainland_china: value }))).notes, [CHINA_YES_NOTE]);
  }
});

test('China: Uncertain shows the softer note', () => {
  assert.deepEqual(computeVerdict(brand(cfk({ sold_in_mainland_china: 'Uncertain' }))).notes, [CHINA_UNCERTAIN_NOTE]);
});

test('China: No, empty or missing show nothing', () => {
  for (const value of ['No', '', undefined]) {
    assert.deepEqual(computeVerdict(brand(cfk({ sold_in_mainland_china: value }))).notes, []);
  }
});

test('parent and China notes come together, parent first', () => {
  const v = computeVerdict(brand(cfk({ parent_companies: ['A'], sold_in_mainland_china: 'Yes' })));
  assert.deepEqual(v.notes, [PARENT_NOTE('A'), CHINA_YES_NOTE]);
});

// Rule 1 (Leaping Bunny certified) is covered below and in verdict-cfi.test.js.
for (const [rule, cruelty_free, verdict] of [
  [2, 'Yes', 'verified'],
  [3, 'No', 'not_cruelty_free'],
  [4, 'Grey Area', 'grey_area'],
]) {
  test(`CFK notes never change the Verdict (rule ${rule})`, () => {
    const plain = computeVerdict(brand(cfk({ cruelty_free })));
    const noisy = computeVerdict(brand(cfk({ cruelty_free, parent_companies: ['A'], sold_in_mainland_china: 'Yes' })));
    const uncertain = computeVerdict(brand(cfk({ cruelty_free, sold_in_mainland_china: 'Uncertain' })));
    for (const v of [noisy, uncertain]) {
      assert.equal(v.verdict, verdict);
      assert.equal(v.label, plain.label);
      assert.equal(v.greyAreaReason, plain.greyAreaReason);
    }
    assert.equal(noisy.notes.length, 2);
  });
}

// Rule 1: a Leaping Bunny certified brand also gets the CFK parent and China Notes.
const lbEntry = { brand_id: 1, trading_name: 'X', is_dirty_parent: false, link: 'https://lb.example/1' };
const cfiEntry = { name: 'X', link: 'https://cfi.example/x/', date: '2026-11-04T09:30:16' };
const certified = (entry) => ({ name: 'X', key: 'x', sources: { lb: lbEntry, cfi: cfiEntry, cfk: entry } });

test('rule 1: parent and China notes appear on a certified brand', () => {
  const v = computeVerdict(certified(cfk({ parent_companies: ['A'], sold_in_mainland_china: 'Yes' })));
  assert.deepEqual(v.notes, [PARENT_NOTE('A'), CHINA_YES_NOTE]);
  assert.deepEqual(computeVerdict(certified(cfk({ sold_in_mainland_china: 'Uncertain' }))).notes, [CHINA_UNCERTAIN_NOTE]);
  assert.deepEqual(computeVerdict(certified(cfk({ parent_companies: ['A'], parent_company_doesnt_test: true }))).notes, []);
});

test('CFK notes never change the Verdict (rule 1)', () => {
  const plain = computeVerdict(certified(cfk()));
  const noisy = computeVerdict(certified(cfk({ parent_companies: ['A'], sold_in_mainland_china: 'Yes' })));
  assert.equal(noisy.verdict, 'certified');
  assert.equal(noisy.label, plain.label);
  assert.equal(noisy.notes.length, 2);
});

test('rule 5: an unknown brand has no notes', () => {
  assert.deepEqual(computeVerdict(brand(null)).notes, []);
});
