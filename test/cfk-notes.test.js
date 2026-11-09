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

// A parent company as stored on the CFK Source entry: its name and CFK's own status for it.
const P = (name, cruelty_free = 'No') => ({ name, cruelty_free });
const PARENT_NOTE = (n) => `Su empresa matriz (${n}) testea en animales, según Cruelty-Free Kitty.`;
const PARENT_GREY_NOTE = (n) => `Su empresa matriz (${n}) está en zona gris, según Cruelty-Free Kitty.`;
const PARENT_NEUTRAL_NOTE = (n) => `Tiene una empresa matriz: ${n}.`;
const CHINA_YES_NOTE =
  'Cruelty-Free Kitty indica que se vende en tiendas físicas de China continental. Es un punto discutido: si la marca está certificada por Leaping Bunny, esa certificación debería pesar más.';
const CHINA_UNCERTAIN_NOTE = 'Cruelty-Free Kitty no pudo confirmar si se vende en China continental.';

test('parent note: a parent CFK says tests on animals is named as testing', () => {
  const v = computeVerdict(brand(cfk({ parent_companies: [P('Estée Lauder')] })));
  assert.deepEqual(v.notes, [PARENT_NOTE('Estée Lauder')]);
});

test('parent note: a grey area parent is named as grey area, not as testing', () => {
  const v = computeVerdict(brand(cfk({ parent_companies: [P('PDC Wellness & Personal Care', 'Grey Area')] })));
  assert.deepEqual(v.notes, [PARENT_GREY_NOTE('PDC Wellness & Personal Care')]);
});

test('parent note: a cruelty-free parent, or one without a known status, gets the neutral note', () => {
  for (const status of ['Yes', '', null, undefined, 'Something new']) {
    const v = computeVerdict(brand(cfk({ parent_companies: [{ name: 'A', cruelty_free: status }] })));
    assert.deepEqual(v.notes, [PARENT_NEUTRAL_NOTE('A')], `status ${status}`);
  }
});

test('parent note: several parents with the same status share one note', () => {
  const v = computeVerdict(brand(cfk({ parent_companies: [P('A'), P('B')] })));
  assert.deepEqual(v.notes, [PARENT_NOTE('A y B')]);
});

test('parent note: mixed statuses give one note per status, testing first, then grey area, then neutral', () => {
  const parents = [P('N1', ''), P('G', 'Grey Area'), P('T1'), P('Y', 'Yes'), P('T2')];
  const v = computeVerdict(brand(cfk({ parent_companies: parents })));
  assert.deepEqual(v.notes, [PARENT_NOTE('T1 y T2'), PARENT_GREY_NOTE('G'), PARENT_NEUTRAL_NOTE('N1 y Y')]);
});

test('parent note: absent when the "doesn\'t test" attribute is present, whatever the parent status', () => {
  for (const status of ['No', 'Grey Area', 'Yes', '']) {
    const v = computeVerdict(brand(cfk({ parent_companies: [P('A', status)], parent_company_doesnt_test: true })));
    assert.deepEqual(v.notes, []);
  }
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
  const v = computeVerdict(brand(cfk({ parent_companies: [P('A')], sold_in_mainland_china: 'Yes' })));
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
    const noisy = computeVerdict(brand(cfk({ cruelty_free, parent_companies: [P('A')], sold_in_mainland_china: 'Yes' })));
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
  const v = computeVerdict(certified(cfk({ parent_companies: [P('A')], sold_in_mainland_china: 'Yes' })));
  assert.deepEqual(v.notes, [PARENT_NOTE('A'), CHINA_YES_NOTE]);
  assert.deepEqual(computeVerdict(certified(cfk({ sold_in_mainland_china: 'Uncertain' }))).notes, [CHINA_UNCERTAIN_NOTE]);
  assert.deepEqual(computeVerdict(certified(cfk({ parent_companies: [P('A')], parent_company_doesnt_test: true }))).notes, []);
});

test('CFK notes never change the Verdict (rule 1)', () => {
  const plain = computeVerdict(certified(cfk()));
  const noisy = computeVerdict(certified(cfk({ parent_companies: [P('A')], sold_in_mainland_china: 'Yes' })));
  assert.equal(noisy.verdict, 'certified');
  assert.equal(noisy.label, plain.label);
  assert.equal(noisy.notes.length, 2);
});

test('rule 5: an unknown brand has no notes', () => {
  assert.deepEqual(computeVerdict(brand(null)).notes, []);
});
