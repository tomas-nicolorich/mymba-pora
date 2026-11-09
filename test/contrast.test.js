import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../site/css/style.css', import.meta.url), 'utf8');

function tokens(block) {
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
}
const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1];
const light = tokens(css.match(/:root\s*\{([^}]*)\}/)[1]);
const dark = { ...light, ...tokens(darkBlock) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('ratio helper matches known WCAG values', () => {
  assert.equal(ratio('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(ratio('#767676', '#ffffff').toFixed(2), '4.54');
});

const VERDICTS = ['certified', 'verified', 'bad', 'grey', 'unknown'];
for (const [mode, t] of [['light', light], ['dark', dark]]) {
  for (const v of VERDICTS) {
    test(`verdict ${v} text on background is at least AA (${mode})`, () => {
      const r = ratio(t[`--v-${v}-fg`], t[`--v-${v}-bg`]);
      assert.ok(r >= 4.5, `${v} ${mode}: ${r.toFixed(2)}`);
    });
  }
  for (const [fg, bg] of [['--fg', '--bg'], ['--fg', '--card'], ['--jungle', '--bg'], ['--jungle', '--card'], ['--accent-text', '--bg'], ['--accent-text', '--card']]) {
    test(`theme ${fg} on ${bg} is at least AA (${mode})`, () => {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${mode}: ${r.toFixed(2)}`);
    });
  }
}

test('verdict backgrounds differ from theme accent and jungle (not confusable)', () => {
  for (const t of [light, dark]) {
    for (const v of VERDICTS) {
      for (const theme of ['--accent', '--jungle']) {
        assert.notEqual(t[`--v-${v}-bg`].toLowerCase(), t[theme].toLowerCase());
      }
    }
  }
});

test('UI copy uses voseo, not tuteo', () => {
  const files = ['../site/index.html', '../site/js/app.js', '../src/verdict.js'];
  const text = files.map((f) => readFileSync(new URL(f, import.meta.url), 'utf8')).join('\n');
  for (const bad of [/\bBusca\b/, /\bVerifica\b/, /\bPrueba\b/, /\bTú\b/i, /\btienes\b/i, /\bpuedes\b/i, /\bquieres\b/i, /\bpregunta a\b/i, /\bPregúntale\b/i]) {
    assert.doesNotMatch(text, bad);
  }
});
