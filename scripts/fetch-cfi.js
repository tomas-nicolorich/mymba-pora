// Network layer for the Cruelty Free International approved-brands directory (WordPress REST): polite, sequential, paginated.
import { SOURCE_LABELS } from '../src/labels.js';
import { DELAY_MS, fetchWordPressCollection } from './http.js';

export const CFI_ENDPOINT = 'https://www.crueltyfreeinternational.org/wp-json/wp/v2/approved_bra_dir_ltg';
const FIELDS = 'id,link,title,date'; // the directory exposes no categories

export const fetchCfi = ({ fetchImpl, delayMs = DELAY_MS, log } = {}) =>
  fetchWordPressCollection({ endpoint: CFI_ENDPOINT, fields: FIELDS, label: SOURCE_LABELS.cfi, fetchImpl, delayMs, log });
