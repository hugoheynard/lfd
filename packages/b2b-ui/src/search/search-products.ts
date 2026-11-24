/**
 * **Le moteur de recherche de produits**, pur et sans framework : une liste déjà
 * chargée en entier, une requête tapée, et la liste filtrée puis triée.
 *
 * Décidé avec Hugo le 2026-11-24 : une seule recherche de produits, tolérante
 * aux fautes de frappe, côté front. Chaque écran dit seulement où lire le nom,
 * le SKU et, s'il le veut, des textes de plus (la famille) ; le moteur ne
 * connaît aucun type d'article.
 */

/** Où lire, sur un article, ce que la recherche compare. */
export interface ProductSearchKeys<T> {
  readonly nameOf: (item: T) => string;
  /** Le SKU — ou plusieurs, quand un produit porte ceux de ses déclinaisons. */
  readonly skuOf: (item: T) => string | readonly string[];
  /** Des textes de plus dont les mots comptent comme ceux du nom (la famille…). */
  readonly extraOf?: ((item: T) => string | readonly string[]) | undefined;
}

/** Le rang d'un article retenu : plus petit, plus haut dans la liste. */
const RANK_SKU_EXACT = 0;
const RANK_NAME_STARTS = 1;
const RANK_ALL_WORDS_EXACT = 2;
const RANK_APPROXIMATE = 3;

/** En dessous, aucune faute n'est tolérée ; à partir de, une ; puis deux. */
const ONE_TYPO_FROM = 4;
const TWO_TYPOS_FROM = 8;

/** Minuscules, sans accents, toute ponctuation devenue une espace. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function wordsOf(text: string): readonly string[] {
  const normalized = normalizeSearchText(text);
  return normalized === '' ? [] : normalized.split(' ');
}

/** Combien de fautes un mot tapé de cette longueur peut porter. */
export function typoBudget(length: number): number {
  if (length >= TWO_TYPOS_FROM) {
    return 2;
  }
  return length >= ONE_TYPO_FROM ? 1 : 0;
}

/**
 * Distance de Damerau-Levenshtein (variante « alignement optimal ») : lettre
 * manquante, en trop, remplacée, ou deux voisines inversées comptent une faute.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2]![j - 2]! + 1);
      }
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Le mot tapé est-il, à `budget` fautes près, le mot entier ou son début ?
 * On compare aussi aux débuts de longueur voisine (± le budget) : « crosi »
 * est le début de « croissant » à une inversion près, « croisant » ce mot à
 * une lettre manquante près, et « crossant » le début « croiss » d'une lettre.
 */
function nearlyMatches(typed: string, word: string, budget: number): boolean {
  if (damerauLevenshtein(typed, word) <= budget) {
    return true;
  }
  const shortest = Math.max(1, typed.length - budget);
  const longest = Math.min(word.length - 1, typed.length + budget);
  for (let length = shortest; length <= longest; length++) {
    if (damerauLevenshtein(typed, word.slice(0, length)) <= budget) {
      return true;
    }
  }
  return false;
}

type WordMatch = 'exact' | 'approximate' | 'none';

function matchWord(typed: string, words: readonly string[]): WordMatch {
  if (words.some((word) => word.includes(typed))) {
    return 'exact';
  }
  const budget = typoBudget(typed.length);
  if (budget > 0 && words.some((word) => nearlyMatches(typed, word, budget))) {
    return 'approximate';
  }
  return 'none';
}

function extraWords<T>(item: T, keys: ProductSearchKeys<T>): readonly string[] {
  if (keys.extraOf === undefined) {
    return [];
  }
  const extra = keys.extraOf(item);
  const texts: readonly string[] = typeof extra === 'string' ? [extra] : extra;
  return texts.flatMap(wordsOf);
}

/** Le rang de l'article pour cette requête, ou `null` s'il ne répond pas. */
function rankOf<T>(
  item: T,
  rawQuery: string,
  typedWords: readonly string[],
  keys: ProductSearchKeys<T>,
): number | null {
  const skuOrSkus = keys.skuOf(item);
  const skus = (typeof skuOrSkus === 'string' ? [skuOrSkus] : skuOrSkus).map((sku) =>
    sku.toLowerCase(),
  );
  if (skus.includes(rawQuery)) {
    return RANK_SKU_EXACT;
  }
  const name = normalizeSearchText(keys.nameOf(item));
  const query = typedWords.join(' ');
  if (query !== '' && name.startsWith(query)) {
    return RANK_NAME_STARTS;
  }
  const skuMatches = skus.some((sku) => sku.includes(rawQuery));
  if (typedWords.length === 0) {
    return skuMatches ? RANK_ALL_WORDS_EXACT : null;
  }
  const words = [...(name === '' ? [] : name.split(' ')), ...extraWords(item, keys)];
  let approximate = false;
  for (const typed of typedWords) {
    const match = matchWord(typed, words);
    if (match === 'none') {
      return skuMatches ? RANK_ALL_WORDS_EXACT : null;
    }
    approximate ||= match === 'approximate';
  }
  return approximate && !skuMatches ? RANK_APPROXIMATE : RANK_ALL_WORDS_EXACT;
}

/**
 * Les articles qui répondent à la requête, les exacts d'abord (SKU exact, puis
 * nom qui commence par la requête, puis tous les mots trouvés tels quels), les
 * approchés ensuite ; à rang égal, l'ordre reçu. Le SKU se cherche tel quel,
 * en sous-chaîne, jamais approché : un SKU voisin est un autre article.
 * Une requête vide rend la liste telle quelle.
 */
export function searchProducts<T>(
  items: readonly T[],
  query: string,
  keys: ProductSearchKeys<T>,
): readonly T[] {
  const rawQuery = query.trim().toLowerCase();
  if (rawQuery === '') {
    return items;
  }
  const typedWords = wordsOf(query);
  const ranked: { readonly item: T; readonly rank: number; readonly index: number }[] = [];
  items.forEach((item, index) => {
    const rank = rankOf(item, rawQuery, typedWords, keys);
    if (rank !== null) {
      ranked.push({ item, rank, index });
    }
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((entry) => entry.item);
}
