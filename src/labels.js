// Shared by the browser suggestions list. When several suggestions share a key (same-Source
// collisions, kept as separate brands), each is labeled with its Source so they can be told apart.

export const SOURCE_LABELS = { cfk: 'Cruelty-Free Kitty', lb: 'Leaping Bunny', cfi: 'Cruelty Free International' };

export function suggestionLabels(brands) {
  const counts = new Map();
  for (const b of brands) counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
  return brands.map((b) => {
    if (counts.get(b.key) < 2) return b.name;
    const sources = Object.keys(b.sources ?? {}).map((s) => SOURCE_LABELS[s] ?? s);
    return `${b.name} (${sources.join(', ')})`;
  });
}
