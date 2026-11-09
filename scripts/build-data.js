// The single local command: fetch every Source and write data/dataset.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchCfk } from './fetch-cfk.js';
import { fetchLeapingBunny } from './fetch-lb.js';
import { refreshDetails, selectRefresh, loadCache, saveCache } from './lb-details.js';
import { buildDataset } from './build-dataset.js';

const log = (m) => console.error(m);
const cfk = await fetchCfk({ log });
const lb = await fetchLeapingBunny({ log });
const brandIds = lb.items.map((i) => i.BrandId);
const lbDetails = await refreshDetails({
  ids: selectRefresh(brandIds, loadCache()),
  cache: loadCache(),
  warn: (m) => console.error(`warning: ${m}`),
  log,
});
saveCache(lbDetails);
const { dataset, warnings } = buildDataset({ generatedAt: new Date().toISOString(), cfk, lb, lbDetails });
for (const w of warnings) log(`warning: ${w}`);

const out = new URL('../data/dataset.json', import.meta.url);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(out, JSON.stringify(dataset) + '\n');
log(`wrote data/dataset.json: ${dataset.brands.length} brands`);
