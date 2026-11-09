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

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function spanishDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]} de ${m[1]}` : 'fecha desconocida';
}

function cfkNotes(cfk) {
  const notes = [];
  const parents = Array.isArray(cfk.parent_companies) ? cfk.parent_companies : [];
  if (parents.length && !cfk.parent_company_doesnt_test) {
    notes.push(`Su empresa matriz (${joinSpanish(parents)}) testea en animales, según Cruelty-Free Kitty.`);
  }
  const china = String(cfk.sold_in_mainland_china ?? '');
  if (china.startsWith('Yes')) {
    notes.push(
      'Cruelty-Free Kitty indica que se vende en tiendas físicas de China continental. Es un punto discutido: si la marca está certificada por Leaping Bunny, esa certificación debería pesar más.',
    );
  } else if (china === 'Uncertain') {
    notes.push('Cruelty-Free Kitty no pudo confirmar si se vende en China continental.');
  }
  return notes;
}

const ONLY_LB_NOTE = 'Solo figura en el directorio de Leaping Bunny, no en el de Cruelty Free International.';
const ONLY_CFI_NOTE = 'Solo figura en el directorio de Cruelty Free International, no en el de Leaping Bunny.';
const CFK_TAG_NOTE =
  'Cruelty-Free Kitty la etiqueta como certificada por Leaping Bunny, pero no figura en ninguno de los dos directorios (Leaping Bunny y Cruelty Free International).';

const hasLeapingBunnyTag = (cfk) => Array.isArray(cfk?.certifications) && cfk.certifications.includes('Leaping Bunny');

export function computeVerdict(brand) {
  const cfk = brand?.sources?.cfk;
  const lb = brand?.sources?.lb;
  const cfi = brand?.sources?.cfi;
  // Rule 1: listed in Leaping Bunny or Cruelty Free International, whatever CFK says.
  if (lb || cfi) {
    const notes = [];
    if (cfk?.cruelty_free === 'No') {
      notes.push(
        `Cruelty-Free Kitty la marca como no libre de crueldad (ficha del ${spanishDate(cfk.modified)}), pero Leaping Bunny la certifica.`,
      );
    }
    if (lb?.is_dirty_parent) notes.push('Su empresa matriz no está certificada por Leaping Bunny.');
    if (cfk) notes.push(...cfkNotes(cfk));
    if (!cfi) notes.push(ONLY_LB_NOTE);
    else if (!lb) notes.push(ONLY_CFI_NOTE);
    return { verdict: 'certified', label: 'Libre de crueldad · Certificada por Leaping Bunny', notes };
  }
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
  const notes = cfkNotes(cfk);
  if (hasLeapingBunnyTag(cfk)) notes.push(CFK_TAG_NOTE);
  if (status === 'Yes') {
    return {
      verdict: 'verified',
      label: 'Libre de crueldad · Verificada por Cruelty-Free Kitty, sin certificación',
      notes,
    };
  }
  if (status === 'No') {
    return { verdict: 'not_cruelty_free', label: 'No es libre de crueldad', notes };
  }
  // 'Grey Area' and any unrecognised value (e.g. 'MLM') land here; the raw value is kept for display.
  return {
    verdict: 'grey_area',
    label: 'Zona gris',
    greyAreaReason: greyAreaReason(cfk),
    rawStatus: status,
    notes,
  };
}
