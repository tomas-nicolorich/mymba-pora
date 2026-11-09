import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict, describeFlags, FLAG_LABELS } from '../src/verdict.js';

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

test('rule 2: CFK cruelty-free, not certified -> Verified cruelty-free', () => {
  const v = computeVerdict(brand(cfk({ cruelty_free: 'Yes' })));
  assert.equal(v.verdict, 'verified');
  assert.equal(v.label, 'Libre de crueldad · Verificada por Cruelty-Free Kitty, sin certificación');
  assert.deepEqual(v.notes, []);
});

test('rule 3: CFK not cruelty-free -> Not cruelty-free', () => {
  const v = computeVerdict(brand(cfk({ cruelty_free: 'No' })));
  assert.equal(v.verdict, 'not_cruelty_free');
  assert.equal(v.label, 'No es libre de crueldad');
});

test('rule 4: grey area with all flags empty -> "couldn\'t confirm" wording', () => {
  const v = computeVerdict(brand(cfk({ cruelty_free: 'Grey Area' })));
  assert.equal(v.verdict, 'grey_area');
  assert.equal(v.label, 'Zona gris');
  assert.equal(v.greyAreaReason, 'Cruelty-Free Kitty no pudo confirmar su política de testeo en animales.');
});

test('rule 4: all flags Uncertain behaves like empty', () => {
  const u = 'Uncertain';
  const v = computeVerdict(brand(cfk({
    cruelty_free: 'Grey Area',
    finished_products_tested_on_animals: u,
    ingredients_tested_on_animals: u,
    suppliers_test_on_animals: u,
    third_party_animal_testing: u,
  })));
  assert.equal(v.greyAreaReason, 'Cruelty-Free Kitty no pudo confirmar su política de testeo en animales.');
});

test('rule 4: one non-No flag is named', () => {
  const v = computeVerdict(brand(cfk({
    cruelty_free: 'Grey Area',
    finished_products_tested_on_animals: 'No',
    ingredients_tested_on_animals: 'No',
    suppliers_test_on_animals: 'Uncertain',
    third_party_animal_testing: 'No',
  })));
  assert.equal(v.greyAreaReason, 'Cruelty-Free Kitty no pudo confirmar: proveedores.');
});

test('rule 4: several non-No flags are listed with "y"', () => {
  const v = computeVerdict(brand(cfk({
    cruelty_free: 'Grey Area',
    finished_products_tested_on_animals: 'No',
    ingredients_tested_on_animals: 'Uncertain',
    suppliers_test_on_animals: '',
    third_party_animal_testing: 'No',
  })));
  assert.equal(v.greyAreaReason, 'Cruelty-Free Kitty no pudo confirmar: ingredientes y proveedores.');
});

test('rule 4: derived "sold where required by law" is named when finished products test where required', () => {
  const v = computeVerdict(brand(cfk({
    cruelty_free: 'Grey Area',
    finished_products_tested_on_animals: 'Yes, where required by law',
    ingredients_tested_on_animals: 'No',
    suppliers_test_on_animals: 'No',
    third_party_animal_testing: 'No',
  })));
  assert.equal(
    v.greyAreaReason,
    'Cruelty-Free Kitty no pudo confirmar: productos terminados y venta donde la ley lo exige.',
  );
});

test('rule 4: "No, with possible exceptions" is not exactly No, so it is listed', () => {
  const v = computeVerdict(brand(cfk({
    cruelty_free: 'Grey Area',
    finished_products_tested_on_animals: 'No',
    ingredients_tested_on_animals: 'No, with possible exceptions',
    suppliers_test_on_animals: 'No',
    third_party_animal_testing: 'No',
  })));
  assert.equal(v.greyAreaReason, 'Cruelty-Free Kitty no pudo confirmar: ingredientes.');
});

test('unknown CFK status (e.g. MLM) -> Grey area, raw value kept for display', () => {
  const v = computeVerdict(brand(cfk({ cruelty_free: 'MLM' })));
  assert.equal(v.verdict, 'grey_area');
  assert.equal(v.rawStatus, 'MLM');
});

test('rule 5: no Source entries -> Unknown with the three questions', () => {
  const v = computeVerdict(brand(null));
  assert.equal(v.verdict, 'unknown');
  assert.equal(v.label, 'Sin datos');
  assert.equal(v.message, 'No la encontramos en ninguna fuente. Preguntale a la marca:');
  assert.deepEqual(v.questions, [
    '¿Sus proveedores testean ingredientes en animales?',
    '¿Testean donde la ley lo exige?',
    '¿Venden en tiendas físicas de China continental?',
  ]);
});

test('computeVerdict(undefined) is Unknown too', () => {
  assert.equal(computeVerdict(undefined).verdict, 'unknown');
});

test('describeFlags returns the five flags in Spanish, deriving "required by law"', () => {
  const flags = describeFlags(cfk({
    finished_products_tested_on_animals: 'Yes, where required by law',
    ingredients_tested_on_animals: 'Uncertain',
    suppliers_test_on_animals: 'No',
    third_party_animal_testing: '',
  }));
  assert.deepEqual(flags.map((f) => f.label), [
    'Productos terminados', 'Ingredientes', 'Proveedores', 'Terceros', 'Venta donde la ley lo exige',
  ]);
  assert.deepEqual(flags.map((f) => f.value), [
    'Sí, donde la ley lo exige', 'Sin confirmar', 'No', 'Sin confirmar', 'Sí',
  ]);
  assert.equal(FLAG_LABELS.length, 5);
});

test('derived "required by law" is No when finished and third-party are both No', () => {
  const flags = describeFlags(cfk({
    finished_products_tested_on_animals: 'No',
    third_party_animal_testing: 'No',
  }));
  assert.equal(flags[4].value, 'No');
});
