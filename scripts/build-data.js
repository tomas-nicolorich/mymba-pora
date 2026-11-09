// The single local command: fetch every Source and write data/dataset.json.
// Fails loudly (non-zero exit) and writes nothing if any Source fails or looks wrong; see scripts/job.js.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchCfk } from './fetch-cfk.js';
import { fetchLeapingBunny } from './fetch-lb.js';
import { refreshDetails, selectRefresh, loadCache, saveCache } from './lb-details.js';
import { fetchCfi } from './fetch-cfi.js';
import { runJob } from './job.js';

const log = (m) => console.error(m);
const readJson = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));

try {
  await runJob({
    fetchers: {
      cfk: () => fetchCfk({ log }),
      lb: () => fetchLeapingBunny({ log }),
      cfi: () => fetchCfi({ log }),
    },
    loadPrevious: () => {
      try {
        return readJson('dataset.json');
      } catch {
        return null;
      }
    },
    loadAliases: () => readJson('aliases.json'),
    // Returns the refreshed cache in memory; it is only saved once validation passes.
    refreshDetails: (lb) => {
      const cache = loadCache();
      return refreshDetails({
        ids: selectRefresh(lb.items.map((i) => i.BrandId), cache),
        cache,
        warn: (m) => console.error(`warning: ${m}`),
        log,
      });
    },
    write: ({ dataset, cache }) => {
      mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
      saveCache(cache);
      writeFileSync(new URL('../data/dataset.json', import.meta.url), JSON.stringify(dataset) + '\n');
      log(`wrote data/dataset.json: ${dataset.brands.length} brands`);
    },
    log,
  });
} catch (err) {
  console.error(`error: ${err.message}`);
  console.error('data/dataset.json and data/lb-details.json were left untouched.');
  process.exit(1);
}
