import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, decodeEntities } from '../src/normalize.js';

test('loreal variants share one key', () => {
  const keys = ['loreal', "L'Oréal", 'L OREAL', 'L’ORÉAL'].map(normalizeName);
  assert.deepEqual(new Set(keys), new Set(['loreal']));
});

test('& and "and" are equivalent', () => {
  assert.equal(normalizeName('Bath & Body Works'), normalizeName('Bath and Body Works'));
  assert.equal(normalizeName('Bath&Body Works'), normalizeName('bath and body works'));
});

test('leading "The" is ignored, inner "the" is kept', () => {
  assert.equal(normalizeName('The Ordinary'), normalizeName('Ordinary'));
  assert.notEqual(normalizeName('Bath the Body'), normalizeName('Bath Body'));
});

test('punctuation and spacing are ignored', () => {
  assert.equal(normalizeName('E.L.F.  Cosmetics'), normalizeName('elf cosmetics'));
  assert.equal(normalizeName('  Dr.  Organic '), 'drorganic');
});

test('accents are stripped', () => {
  assert.equal(normalizeName('Ace Beauté'), normalizeName('ace beaute'));
});

test('HTML entities are decoded first', () => {
  assert.equal(normalizeName('CHASIN&#8217; RABBITS'), normalizeName("Chasin' Rabbits"));
  assert.equal(normalizeName('Estée &amp; Co'), normalizeName('Estee and Co'));
  assert.equal(normalizeName('A &amp;#8217; B'), normalizeName("A' B"));
});

test('multiply-encoded entities decode fully', () => {
  assert.equal(decodeEntities('Grace &amp;amp; Stella'), 'Grace & Stella');
  assert.equal(decodeEntities('Grace &amp;amp;#038; Stella'), 'Grace & Stella');
  assert.equal(decodeEntities('Grace &amp;#038; Stella'), 'Grace & Stella');
});
