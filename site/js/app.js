import Fuse from '../vendor/fuse.min.mjs';
import { normalizeName } from '../../src/normalize.js';
import { computeVerdict, describeFlags } from '../../src/verdict.js';

const $ = (id) => document.getElementById(id);
const input = $('q');
const list = $('suggestions');
const result = $('result');
const status = $('status');

const ICONS = { certified: '✓', verified: '✓', not_cruelty_free: '✗', grey_area: '?', unknown: '?' };
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const c of children) node.append(c);
  return node;
}

let brands = [];
let fuse;
let matches = [];
let active = -1;

function suggest(query) {
  const q = normalizeName(query);
  if (!q) return [];
  const found = fuse.search(q, { limit: 8 }).map((r) => r.item);
  // Prefix/substring hits first, so "ordinary" puts The Ordinary on top.
  return found.sort((a, b) => Number(b.key.includes(q)) - Number(a.key.includes(q)));
}

function renderSuggestions() {
  list.replaceChildren();
  if (!matches.length) {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    return;
  }
  matches.forEach((b, i) => {
    const li = el('li', { role: 'option', id: `opt-${i}`, textContent: b.name });
    li.setAttribute('aria-selected', String(i === active));
    li.addEventListener('mousedown', (e) => { e.preventDefault(); choose(b); });
    list.append(li);
  });
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function choose(brand) {
  input.value = brand.name;
  matches = [];
  active = -1;
  renderSuggestions();
  showCard(brand);
}

function showNotFound(query) {
  result.replaceChildren(showVerdictCard({ name: query.trim(), sources: {} }));
}

function showCard(brand) {
  result.replaceChildren(showVerdictCard(brand));
}

function showVerdictCard(brand) {
  const v = computeVerdict(brand);
  const card = el('article', { class: 'card' }, el('h2', { textContent: brand.name }));
  const text = el('div', { class: 'text' }, v.label);
  card.append(el('div', { class: `verdict ${v.verdict}` }, el('span', { class: 'icon', ariaHidden: 'true', textContent: ICONS[v.verdict] }), text));

  const detail = el('div', { class: 'detail' });
  if (v.message) detail.append(el('p', { textContent: v.message }));
  if (v.questions) detail.append(el('ul', {}, ...v.questions.map((q) => el('li', { textContent: q }))));
  if (v.greyAreaReason) detail.append(el('p', { textContent: v.greyAreaReason }));
  for (const note of v.notes ?? []) detail.append(el('p', { class: 'note', textContent: note }));

  const lb = brand.sources?.lb;
  if (lb) {
    detail.append(el('h3', { textContent: 'Leaping Bunny dice' }));
    detail.append(el('p', { textContent: 'Estado: Certificada' }));
    if (lb.certified_since) detail.append(el('p', { textContent: `Certificada desde ${lb.certified_since}` }));
    if (lb.categories?.length) detail.append(el('p', { textContent: `Categoría: ${lb.categories.join(', ')}` }));
    detail.append(el('p', { class: 'dates' }, `Revisado por nosotros el ${fmtDate(lb.fetched_at)}`));
    detail.append(el('p', {}, el('a', { href: lb.link, rel: 'noopener', target: '_blank', textContent: 'Ver la ficha en Leaping Bunny' })));
  }

  if (v.notes?.length) detail.append(el('ul', { class: 'notes' }, ...v.notes.map((n) => el('li', { textContent: n }))));

  const cfk = brand.sources?.cfk;
  if (cfk) {
    detail.append(el('h3', { textContent: 'Cruelty-Free Kitty dice' }));
    detail.append(el('p', { textContent: `Estado: ${v.rawStatus ?? cfk.cruelty_free}` }));
    const dl = el('dl');
    for (const f of describeFlags(cfk)) dl.append(el('dt', { textContent: f.label }), el('dd', { textContent: f.value }));
    detail.append(dl);
    detail.append(el('p', { class: 'dates' },
      `Ficha actualizada el ${fmtDate(cfk.modified)}`, el('br'),
      `Revisado por nosotros el ${fmtDate(cfk.fetched_at)}`));
    detail.append(el('p', {}, el('a', { href: cfk.link, rel: 'noopener', target: '_blank', textContent: 'Ver la ficha en Cruelty-Free Kitty' })));
  }
  card.append(detail);
  return card;
}

input.addEventListener('input', () => {
  status.hidden = true;
  result.replaceChildren();
  matches = suggest(input.value);
  active = -1;
  renderSuggestions();
  if (!matches.length && normalizeName(input.value).length >= 2) showNotFound(input.value);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && matches.length) { active = (active + 1) % matches.length; renderSuggestions(); e.preventDefault(); }
  else if (e.key === 'ArrowUp' && matches.length) { active = (active - 1 + matches.length) % matches.length; renderSuggestions(); e.preventDefault(); }
  else if (e.key === 'Escape') { matches = []; renderSuggestions(); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const pick = matches[active >= 0 ? active : 0];
    if (pick) choose(pick);
    else if (normalizeName(input.value)) { matches = []; renderSuggestions(); showNotFound(input.value); }
  }
});
input.addEventListener('blur', () => { matches = []; renderSuggestions(); });

async function init() {
  try {
    const res = await fetch('../data/dataset.json');
    if (!res.ok) throw new Error(res.status);
    const dataset = await res.json();
    brands = dataset.brands;
    fuse = new Fuse(brands, { keys: ['key'], threshold: 0.3, ignoreLocation: true, minMatchCharLength: 2 });
    $('updated').textContent = `Datos actualizados: ${fmtDate(dataset.generated_at)}`;
  } catch {
    status.hidden = false;
    status.textContent = 'No pudimos cargar los datos. Probá de nuevo más tarde.';
    input.disabled = true;
  }
}
init();
