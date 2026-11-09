// Shared by Node (scripts, tests) and the browser: no Node APIs. Defines the Sources once and the
// suggestions-list labels. When several suggestions share a key (same-Source collisions, kept as
// separate brands), each is labeled with its Source so they can be told apart.

// Every Source, in fetch order, with its display label. Add a Source here first.
export const SOURCES = [
  { key: 'cfk', label: 'Cruelty-Free Kitty' },
  { key: 'lb', label: 'Leaping Bunny' },
  { key: 'cfi', label: 'Cruelty Free International' },
];

export const SOURCE_LABELS = Object.fromEntries(SOURCES.map((s) => [s.key, s.label]));

export function suggestionLabels(brands) {
  const counts = new Map();
  for (const b of brands) counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
  return brands.map((b) => {
    if (counts.get(b.key) < 2) return b.name;
    const sources = Object.keys(b.sources ?? {}).map((s) => SOURCE_LABELS[s] ?? s);
    return `${b.name} (${sources.join(', ')})`;
  });
}
