// The data job with safety rails: fetch every Source, validate, and only then hand the result to `write`.
// Any problem throws, so the caller exits non-zero and nothing (dataset or cache) is written.
import { SOURCE_LABELS } from '../src/labels.js';
import { buildDataset } from './build-dataset.js';

export const FIRST_RUN_MINIMUMS = { cfk: 1300, lb: 2000, cfi: 350 };
export const MIN_RATIO = { num: 9, den: 10 };

// `previous` is the previous dataset's counts (or null). A Source missing from it is a first run for that Source.
export function checkCounts(counts, previous, minimums = FIRST_RUN_MINIMUMS) {
  const problems = [];
  for (const source of Object.keys(minimums)) {
    const label = SOURCE_LABELS[source];
    const count = counts[source] ?? 0;
    const before = previous?.[source];
    if (Number.isFinite(before)) {
      if (count * MIN_RATIO.den < before * MIN_RATIO.num) {
        problems.push(`${label} returned ${count} brands, below 90% of the previous ${before}`);
      }
    } else if (count < minimums[source]) {
      problems.push(`${label} returned ${count} brands, below the first-run minimum of ${minimums[source]}`);
    }
  }
  if (problems.length) throw new Error(problems.join('; '));
}

export async function runJob({ fetchers, loadPrevious, loadAliases, refreshDetails, write, log, minimums = FIRST_RUN_MINIMUMS }) {
  const raw = {};
  for (const source of ['cfk', 'lb', 'cfi']) {
    try {
      raw[source] = await fetchers[source]();
    } catch (err) {
      throw new Error(`${SOURCE_LABELS[source]} fetch failed: ${err.message}`);
    }
  }
  const lbDetails = await refreshDetails(raw.lb);
  const { dataset, warnings } = buildDataset({
    generatedAt: new Date().toISOString(),
    ...raw,
    lbDetails,
    aliases: loadAliases(),
  });
  checkCounts(dataset.counts, loadPrevious()?.counts ?? null, minimums);
  for (const w of warnings) log(`warning: ${w}`);
  write({ dataset, cache: lbDetails });
  return dataset;
}
