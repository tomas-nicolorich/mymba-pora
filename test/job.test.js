import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runJob, checkCounts } from '../scripts/job.js';

const read = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const raw = {
  cfk: { items: read('cfk-raw.json'), parents: read('cfk-parents-raw.json'), fetchedAt: 't', sourceUrl: 'u' },
  lb: { items: read('lb-raw.json'), fetchedAt: 't', sourceUrl: 'u' },
  cfi: { items: read('cfi-raw.json'), fetchedAt: 't', sourceUrl: 'u' },
};
const SMALL = { cfk: 1, lb: 1, cfi: 1 };

function harness({ previous = null, fail = {}, minimums } = {}) {
  const writes = [];
  const deps = {
    fetchers: Object.fromEntries(
      Object.keys(raw).map((s) => [s, async () => { if (fail[s]) throw new Error('boom'); return raw[s]; }]),
    ),
    loadPrevious: () => previous,
    loadAliases: () => ({}),
    refreshDetails: async () => ({ 1: { year: '2020' } }),
    write: (out) => writes.push(out),
    log: () => {},
    minimums,
  };
  return { deps, writes };
}

test('checkCounts: exactly 90% of the previous count passes, just below fails with both counts', () => {
  const prev = { cfk: 100, lb: 100, cfi: 100 };
  assert.doesNotThrow(() => checkCounts({ cfk: 90, lb: 100, cfi: 100 }, prev));
  assert.throws(() => checkCounts({ cfk: 89, lb: 100, cfi: 100 }, prev), /Cruelty-Free Kitty.*89.*100/);
});

test('checkCounts: first run applies minimums; a Source missing from the previous dataset is a first run for it', () => {
  const ok = { cfk: 1300, lb: 2000, cfi: 350 };
  assert.doesNotThrow(() => checkCounts(ok, null));
  assert.throws(() => checkCounts({ ...ok, lb: 1999 }, null), /Leaping Bunny.*1999.*2000/);
  assert.throws(() => checkCounts({ ...ok, cfi: 349 }, {}), /Cruelty Free International/);
  assert.doesNotThrow(() => checkCounts(ok, { cfk: 1300 }));
  assert.throws(() => checkCounts({ ...ok, lb: 1999 }, { cfk: 1300 }), /Leaping Bunny/);
});

test('all OK: writes dataset and cache once', async () => {
  const { deps, writes } = harness({ minimums: SMALL });
  await runJob(deps);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].dataset.counts, { cfk: 4, lb: 3, cfi: 3 });
  assert.deepEqual(writes[0].cache, { 1: { year: '2020' } });
});

test('a failing Source names itself and writes nothing', async () => {
  const { deps, writes } = harness({ fail: { lb: true }, minimums: SMALL });
  await assert.rejects(runJob(deps), /Leaping Bunny.*boom/);
  assert.equal(writes.length, 0);
});

test('a count regression writes nothing', async () => {
  const { deps, writes } = harness({ previous: { counts: { cfk: 4, lb: 10, cfi: 3 } } });
  await assert.rejects(runJob(deps), /Leaping Bunny.*3.*10/);
  assert.equal(writes.length, 0);
});

test('first run below minimums writes nothing; above passes', async () => {
  const low = harness({ previous: { counts: { cfk: 4 } } });
  await assert.rejects(runJob(low.deps), /Leaping Bunny/);
  assert.equal(low.writes.length, 0);
  const high = harness({ previous: { counts: { cfk: 4 } }, minimums: SMALL });
  await runJob(high.deps);
  assert.equal(high.writes.length, 1);
});
