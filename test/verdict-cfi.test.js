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
const lb = { brand_id: 1, trading_name: 'X', is_dirty_parent: false, link: 'https://lb.example/1', fetched_at: '2026-11-09T12:00:00Z', source_url: 'https://lb.example/api' };
const cfi = { name: 'X', link: 'https://www.crueltyfreeinternational.org/approved-brands/listing/x/', date: '2026-11-04T09:30:16', fetched_at: '2026-11-09T12:00:00Z', source_url: 'https://cfi.example/api' };
const brand = (sources) => ({ name: 'X', key: 'x', sources });

const CERTIFIED = 'Libre de crueldad · Certificada por Leaping Bunny';
const ONLY_LB = 'Solo figura en el directorio de Leaping Bunny, no en el de Cruelty Free International.';
const ONLY_CFI = 'Solo figura en el directorio de Cruelty Free International, no en el de Leaping Bunny.';
const TAG_NOTE =
  'Cruelty-Free Kitty la etiqueta como certificada por Leaping Bunny, pero no figura en ninguno de los dos directorios (Leaping Bunny y Cruelty Free International).';
const PARENT_NOTE = 'Su empresa matriz (A) testea en animales, según Cruelty-Free Kitty.';
const CHINA_YES_NOTE =
  'Cruelty-Free Kitty indica que se vende en tiendas físicas de China continental. Es un punto discutido: si la marca está certificada por Leaping Bunny, esa certificación debería pesar más.';
const TAGGED = { certifications: ['Leaping Bunny'] };

test('listed in both directories: Certified, no directory Note', () => {
  const v = computeVerdict(brand({ lb, cfi }));
  assert.equal(v.verdict, 'certified');
  assert.equal(v.label, CERTIFIED);
  assert.deepEqual(v.notes, []);
});

test('only Leaping Bunny: Certified plus a Note', () => {
  const v = computeVerdict(brand({ lb }));
  assert.equal(v.verdict, 'certified');
  assert.deepEqual(v.notes, [ONLY_LB]);
});

test('only Cruelty Free International: Certified plus a Note', () => {
  const v = computeVerdict(brand({ cfi }));
  assert.equal(v.verdict, 'certified');
  assert.equal(v.label, CERTIFIED);
  assert.deepEqual(v.notes, [ONLY_CFI]);
});

test('only CFI with CFK "No": Certified, disagreement Note comes first', () => {
  const v = computeVerdict(brand({ cfi, cfk: cfk({ cruelty_free: 'No' }) }));
  assert.equal(v.verdict, 'certified');
  assert.equal(v.notes.length, 2);
  assert.match(v.notes[0], /Cruelty-Free Kitty la marca como no libre/);
  assert.equal(v.notes[1], ONLY_CFI);
});

for (const [rule, cruelty_free, verdict] of [
  [2, 'Yes', 'verified'],
  [3, 'No', 'not_cruelty_free'],
  [4, 'Grey Area', 'grey_area'],
]) {
  test(`CFK Leaping Bunny tag with no directory entry: Note, Verdict follows rule ${rule}`, () => {
    const plain = computeVerdict(brand({ cfk: cfk({ cruelty_free }) }));
    const v = computeVerdict(brand({ cfk: cfk({ cruelty_free, ...TAGGED }) }));
    assert.equal(v.verdict, verdict);
    assert.equal(v.label, plain.label);
    assert.deepEqual(v.notes, [...plain.notes, TAG_NOTE]);
  });
}

test('CFK Leaping Bunny tag is no Note when a directory lists the brand', () => {
  assert.deepEqual(computeVerdict(brand({ lb, cfi, cfk: cfk(TAGGED) })).notes, []);
  assert.deepEqual(computeVerdict(brand({ cfi, cfk: cfk(TAGGED) })).notes, [ONLY_CFI]);
});

// Rule 1 also gets the CFK parent/China Notes (spec story 23; #6 "across rules 1-4").
test('rule 1: CFK parent and China Notes appear on certified brands', () => {
  const v = computeVerdict(brand({ lb, cfi, cfk: cfk({ parent_companies: ['A'], sold_in_mainland_china: 'Yes' }) }));
  assert.equal(v.verdict, 'certified');
  assert.deepEqual(v.notes, [PARENT_NOTE, CHINA_YES_NOTE]);
});

test('rule 1: Notes order is disagreement, Leaping Bunny parent, CFK parent/China, directory', () => {
  const v = computeVerdict(brand({ lb: { ...lb, is_dirty_parent: true }, cfk: cfk({ cruelty_free: 'No', sold_in_mainland_china: 'Uncertain' }) }));
  assert.equal(v.notes.length, 4);
  assert.match(v.notes[0], /la marca como no libre/);
  assert.equal(v.notes[1], 'Su empresa matriz no está certificada por Leaping Bunny.');
  assert.equal(v.notes[2], 'Cruelty-Free Kitty no pudo confirmar si se vende en China continental.');
  assert.equal(v.notes[3], ONLY_LB);
});

for (const [name, sources] of [['lb', { lb }], ['cfi', { cfi }], ['both', { lb, cfi }]]) {
  test(`rule 1 (${name}): CFK notes never change the Verdict`, () => {
    const plain = computeVerdict(brand({ ...sources, cfk: cfk() }));
    const noisy = computeVerdict(brand({ ...sources, cfk: cfk({ parent_companies: ['A'], sold_in_mainland_china: 'Yes' }) }));
    assert.equal(noisy.verdict, 'certified');
    assert.equal(noisy.label, plain.label);
    assert.equal(noisy.notes.length, plain.notes.length + 2);
  });
}
