/**
 * Référence **proposée** à la création — port compact du générateur backend.
 *
 * Référence *signifiante* (lue au labo, cherchée en caisse) plutôt que
 * séquentielle : `VIEN-CROISS-BEURR-1`. Le défaut est proposé, pas garanti —
 * la collision retombe sur un suffixe numérique lisible (`-2`, `-3`).
 */

const SKU_MAX_LENGTH = 32;
const FAMILY_LENGTH = 4;
const PRODUCT_MAX_WORDS = 2;
const PRODUCT_WORD_LENGTH = 6;

/** Mots vides français : ils remplissent la référence sans rien lui apprendre. */
const STOP_WORDS = new Set([
  'A', 'AU', 'AUX', 'D', 'DE', 'DES', 'DU', 'EN', 'ET', 'L', 'LA', 'LE', 'LES', 'SUR',
]);

/** Majuscules, sans accents, segments alphanumériques séparés par des tirets. */
function normalize(source: string): string {
  return source
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

function segments(source: string): string[] {
  const normalized = normalize(source);
  return normalized === '' ? [] : normalized.split('-');
}

/** `viennoiseries` → `VIEN` */
function familyPrefix(categorySlug: string): string {
  return segments(categorySlug).join('').slice(0, FAMILY_LENGTH);
}

/** `Croissant au beurre` → `CROISS-BEURR` */
function productMnemonic(productName: string): string {
  return segments(productName)
    .filter((segment) => !STOP_WORDS.has(segment))
    .slice(0, PRODUCT_MAX_WORDS)
    .map((segment) => segment.slice(0, PRODUCT_WORD_LENGTH))
    .join('-');
}

/** Tronque sans laisser de tiret orphelin en fin de chaîne. */
function truncateTo(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max).replace(/-+$/u, '');
}

export function productSkuRoot(categorySlug: string, productName: string): string {
  return [familyPrefix(categorySlug), productMnemonic(productName)]
    .filter((part) => part !== '')
    .join('-');
}

/**
 * Première référence libre à partir d'une racine. `taken` = l'ensemble des
 * références déjà prises (produits **et** déclinaisons confondus).
 */
export function proposeSku(root: string, taken: ReadonlySet<string>): string {
  const base = root === '' ? 'REF' : root;
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const suffix = attempt === 1 ? '' : `-${attempt}`;
    const candidate = truncateTo(base, SKU_MAX_LENGTH - suffix.length) + suffix;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return `${base}-${Date.now()}`;
}

/** `viennoiseries` / `Croissant au beurre` → slug `croissant-au-beurre`. */
export function slugify(source: string): string {
  return normalize(source).toLowerCase();
}
