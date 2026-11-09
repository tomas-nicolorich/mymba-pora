// The single local command: fetch every Source and write data/dataset.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fetchCfk } from './fetch-cfk.js';
import { fetchLeapingBunny } from './fetch-lb.js';
import { fetchCfi } from './fetch-cfi.js';
import { buildDataset } from './build-dataset.js';

const log = (m) => console.error(m);
const cfk = await fetchCfk({ log });
const lb = await fetchLeapingBunny({ log });
const cfi = await fetchCfi({ log });
const { dataset, warnings } = buildDataset({ generatedAt: new Date().toISOString(), cfk, lb, cfi });
for (const w of warnings) log(`warning: ${w}`);

const out = new URL('../data/dataset.json', import.meta.url);
mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(out, JSON.stringify(dataset) + '\n');
log(`wrote data/dataset.json: ${dataset.brands.length} brands`);
