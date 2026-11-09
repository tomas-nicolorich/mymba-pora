// Pure Verdict logic, shared by Node (tests, pipeline) and the browser.
// Input: one brand { name, key, sources: { cfk?, ... } }. Output: what the card renders.

export const QUESTIONS = [
  '¿Sus proveedores testean ingredientes en animales?',
  '¿Testean donde la ley lo exige?',
  '¿Venden en tiendas físicas de China continental?',
];

export const FLAG_LABELS = [
  'Productos terminados',
  'Ingredientes',
  'Proveedores',
  'Terceros',
  'Venta donde la ley lo exige',
];

const ALL_UNCERTAIN = 'Cruelty-Free Kitty no pudo confirmar su política de testeo en animales.';
const REQUIRED_BY_LAW = 'Yes, where required by law';

// The five flags as raw values. The fifth is derived (see docs: decision 1).
function rawFlags(e) {
  const finished = e.finished_products_tested_on_animals ?? '';
  const third = e.third_party_animal_testing ?? '';
  let byLaw = 'Uncertain';
  if (finished === REQUIRED_BY_LAW || third === REQUIRED_BY_LAW) byLaw = 'Yes';
  else if (finished === 'No' && third === 'No') byLaw = 'No';
  return [finished, e.ingredients_tested_on_animals ?? '', e.suppliers_test_on_animals ?? '', third, byLaw];
}

function spanishValue(raw) {
  if (raw === 'No') return 'No';
  if (raw === 'Yes') return 'Sí';
  if (raw === REQUIRED_BY_LAW) return 'Sí, donde la ley lo exige';
  if (raw === 'No, with possible exceptions') return 'No, con posibles excepciones';
  return 'Sin confirmar';
}

export function describeFlags(entry) {
  return rawFlags(entry).map((raw, i) => ({ label: FLAG_LABELS[i], value: spanishValue(raw) }));
}

function joinSpanish(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function greyAreaReason(entry) {
  const unconfirmed = rawFlags(entry)
    .map((raw, i) => (raw === 'No' ? null : FLAG_LABELS[i].toLowerCase()))
    .filter(Boolean);
  if (unconfirmed.length === FLAG_LABELS.length) return ALL_UNCERTAIN;
  return `Cruelty-Free Kitty no pudo confirmar: ${joinSpanish(unconfirmed)}.`;
}

export function computeVerdict(brand) {
  const cfk = brand?.sources?.cfk;
  // Leaping Bunny / CFI are not collected yet: every brand counts as not certified.
  if (!cfk) {
    return {
      verdict: 'unknown',
      label: 'Sin datos',
      message: 'No la encontramos en ninguna fuente. Preguntale a la marca:',
      questions: [...QUESTIONS],
      notes: [],
    };
  }
  const status = cfk.cruelty_free;
  if (status === 'Yes') {
    return {
      verdict: 'verified',
      label: 'Libre de crueldad · Verificada por Cruelty-Free Kitty, sin certificación',
      notes: [],
    };
  }
  if (status === 'No') {
    return { verdict: 'not_cruelty_free', label: 'No es libre de crueldad', notes: [] };
  }
  // 'Grey Area' and any unrecognised value (e.g. 'MLM') land here; the raw value is kept for display.
  return {
    verdict: 'grey_area',
    label: 'Zona gris',
    greyAreaReason: greyAreaReason(cfk),
    rawStatus: status,
    notes: [],
  };
}
