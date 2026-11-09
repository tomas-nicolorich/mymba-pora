// Shared by the pipeline (Node) and the frontend search (browser): no imports, no Node APIs.

const NAMED = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

function decodeOnce(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

// CFK/CFI sometimes double-encode (&amp;#8217;), so decode twice.
export function decodeEntities(text) {
  return decodeOnce(decodeOnce(String(text ?? '')));
}

export function normalizeName(name) {
  return decodeEntities(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/^\s*the\s+/, '')
    .replace(/[^a-z0-9]+/g, '');
}
