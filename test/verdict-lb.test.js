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
  source_url: 'https://www.crueltyfreekitty.com/wp-json/wp/v2/cfk_brand',
  ...over,
});
const lb = (over = {}) => ({
  brand_id: 1719,
  trading_name: 'X',
  is_dirty_parent: false,
  link: 'https://www.leapingbunny.org/ShopBrandDetail?BrandId=1719',
  fetched_at: '2026-11-09T12:00:00Z',
  source_url: 'https://www.leapingbunny.org/api/Query',
  ...over,
});
const brand = (lbEntry, cfkEntry) => ({
  name: 'X',
  key: 'x',
  sources: { ...(lbEntry && { lb: lbEntry }), ...(cfkEntry && { cfk: cfkEntry }) },
});
const CERTIFIED = 'Libre de crueldad · Certificada por Leaping Bunny';
const DIRTY = 'Su empresa matriz no está certificada por Leaping Bunny.';

for (const [name, entry] of [
  ['cruelty-free', cfk({ cruelty_free: 'Yes' })],
  ['grey area', cfk({ cruelty_free: 'Grey Area' })],
  ['an unknown status', cfk({ cruelty_free: 'MLM' })],
  ['absent', null],
]) {
  test(`rule 1: Leaping Bunny certified + CFK ${name} -> Certified, no Notes`, () => {
    const v = computeVerdict(brand(lb(), entry));
    assert.equal(v.verdict, 'certified');
    assert.equal(v.label, CERTIFIED);
    assert.deepEqual(v.notes, []);
  });
}

test('rule 1: certified + CFK not cruelty-free -> Certified plus disagreement Note with CFK entry date', () => {
  const v = computeVerdict(brand(lb(), cfk({ cruelty_free: 'No', modified: '2026-03-31T19:19:49' })));
  assert.equal(v.verdict, 'certified');
  assert.equal(v.label, CERTIFIED);
  assert.deepEqual(v.notes, [
    'Cruelty-Free Kitty la marca como no libre de crueldad (ficha del 31 de marzo de 2026), pero Leaping Bunny la certifica.',
  ]);
});

test('IsDirtyParent adds the parent Note without changing the Verdict', () => {
  for (const entry of [null, cfk({ cruelty_free: 'Yes' }), cfk({ cruelty_free: 'No' }), cfk({ cruelty_free: 'Grey Area' })]) {
    const plain = computeVerdict(brand(lb(), entry));
    const dirty = computeVerdict(brand(lb({ is_dirty_parent: true }), entry));
    assert.equal(dirty.verdict, plain.verdict);
    assert.equal(dirty.label, plain.label);
    assert.deepEqual(dirty.notes, [...plain.notes, DIRTY]);
  }
});

test('no Leaping Bunny entry: Verdict is unchanged (CFK rules)', () => {
  assert.equal(computeVerdict(brand(null, cfk({ cruelty_free: 'Yes' }))).verdict, 'verified');
});
