/**
 * **Les mots-clés, tels qu'on les écrit et qu'on les cherche** — purs, pour
 * que la bande et les panneaux disent la même chose.
 */

/** La même normalisation que le domaine : découpé, en minuscules. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * La clé de RECHERCHE — pas d'écriture : minuscules et sans diacritiques, pour
 * que la bande trouve ce qu'on tape sans accents. Jamais envoyée au serveur.
 */
export function searchKey(raw: string): string {
  return normalizeTag(raw).normalize('NFD').replace(/\p{M}/gu, '');
}

/** Combien de suggestions au plus : au-delà, on tape une lettre de plus. */
export const SUGGESTION_LIMIT = 8;

/**
 * Les mots existants qui contiennent la saisie, hors ceux déjà portés.
 *
 * N'importe où dans le mot, comme la bande : « sant » trouve « croissant ».
 */
export function tagSuggestions(
  vocabulary: readonly string[],
  needle: string,
  worn: readonly string[],
): readonly string[] {
  if (needle === '') {
    return [];
  }
  const kept = new Set(worn);
  return vocabulary
    .filter((word) => word.includes(needle) && !kept.has(word))
    .slice(0, SUGGESTION_LIMIT);
}

/**
 * Le vocabulaire filtré par une recherche, les mots les plus portés d'abord
 * (puis l'ordre alphabétique).
 *
 * N'importe où dans le mot : « sant » doit trouver « croissant », sinon il
 * faut savoir comment le tag commence pour le retrouver, ce qui est
 * exactement ce qu'on ne sait pas. Et sans égard aux accents : « eclair »
 * trouve « éclair », parce qu'on tape vite.
 */
export function rankedTags<T extends { readonly tag: string; readonly count: number }>(
  all: readonly T[],
  search: string,
): readonly T[] {
  const needle = searchKey(search);
  const ranked = [...all].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'fr'));
  return needle === '' ? ranked : ranked.filter((entry) => searchKey(entry.tag).includes(needle));
}
