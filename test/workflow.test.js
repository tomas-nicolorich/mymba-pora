// The workflow is verified by review; these checks pin the properties the ticket promises
// (schedule, Node 26, timeout, pinned actions, data only committed after a successful job).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = readFileSync(new URL('../.github/workflows/update-data.yml', import.meta.url), 'utf8');

test('runs weekly and on manual trigger', () => {
  assert.match(text, /^[ ]+schedule:\n[ ]+- cron: '[^']+'/m);
  assert.match(text, /^[ ]+workflow_dispatch:/m);
});

test('uses Node 26', () => {
  assert.match(text, /node-version: '?26'?\s*$/m);
});

test('job timeout allows the first ~80 minute run', () => {
  const minutes = [...text.matchAll(/timeout-minutes: (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(minutes.length > 0);
  assert.ok(Math.max(...minutes) >= 100);
});

test('third-party actions are pinned to commit SHAs', () => {
  const uses = [...text.matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map((m) => m[1]);
  assert.ok(uses.length >= 4);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, u);
});

test('data is committed only after tests, data, site build, upload and a successful deploy', () => {
  const at = (re) => text.search(re);
  const order = [
    /run: npm test/,
    /run: npm run build-data/,
    /run: npm run build-site/,
    /uses: actions\/upload-pages-artifact@/,
    /uses: actions\/deploy-pages@/,
    /git commit/,
  ];
  for (const re of order) assert.ok(at(re) > -1, String(re));
  for (let i = 1; i < order.length; i++) assert.ok(at(order[i - 1]) < at(order[i]), `${order[i - 1]} before ${order[i]}`);
  assert.equal([...text.matchAll(/^  [a-z-]+:\n    runs-on:/gm)].length, 1, 'a single job');
  for (const perm of ['contents: write', 'pages: write', 'id-token: write']) assert.match(text, new RegExp(perm));
  assert.match(text, /git commit -m "chore\(data\): /);
  assert.match(text, /git add data\/dataset\.json data\/lb-details\.json/);
  assert.doesNotMatch(text, /if: (always|failure)\(\)/);
});

test('the job uses the github-pages environment', () => {
  assert.match(text, /name: github-pages/);
});
