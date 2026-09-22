import type { FoldTableSort } from 'fold-ng';

/**
 * **Le tri de la liste des produits, hors du composant.**
 *
 * Deux règles y vivent, et aucune n'a besoin d'Angular : comment deux libellés
 * se comparent, et ce que devient le tri quand on clique une en-tête. Les
 * laisser dans la page les rendrait intestables sans monter un `TestBed`, un
 * routeur et quatre doublés — pour vérifier qu'« Éclair » passe avant « Zeste ».
 */

/**
 * Compare deux libellés **comme un lecteur francophone les range**.
 *
 * 🔴 `<` et `localeCompare` ne donnent PAS le même ordre. Le premier compare des
 * points de code UTF-16 : il range « Éclair » après « Zeste », et toutes les
 * majuscules avant toutes les minuscules. Dans une boulangerie, où la moitié des
 * noms portent un accent, la faute est visible dès la première page.
 *
 * `sensitivity: 'base'` ignore la casse et les accents pour l'ÉGALITÉ, pas pour
 * l'ordre — « Éclair » et « eclair » se rangent au même endroit plutôt que de
 * former deux blocs.
 */
export function compareLabels(left: string, right: string): number {
  return left.localeCompare(right, 'fr', { sensitivity: 'base' });
}

/**
 * Le tri suivant, après un clic sur l'en-tête `key`.
 *
 * Croissant, puis décroissant, puis **plus de tri du tout**. Ce troisième état
 * n'est pas une coquetterie : sans lui, l'ordre d'origine du serveur devient
 * inatteignable une fois qu'on a trié, et il n'y a plus de retour en arrière
 * qu'en rechargeant la page.
 *
 * Cliquer une AUTRE colonne repart en croissant — hériter du sens de la colonne
 * précédente ferait arriver en décroissant sur une colonne qu'on ouvre pour la
 * première fois.
 */
export function nextSort(current: FoldTableSort | null, key: string): FoldTableSort | null {
  if (current === null || current.key !== key) {
    return { key, dir: 'asc' };
  }
  return current.dir === 'asc' ? { key, dir: 'desc' } : null;
}

/**
 * Range `rows` selon `sort`, en lisant chaque ligne par `valueOf`.
 *
 * Rend le tableau d'origine **tel quel** quand il n'y a pas de tri : une copie
 * inutile ferait recalculer tout ce qui en dépend à chaque lecture.
 */
export function sortRows<T>(
  rows: readonly T[],
  sort: FoldTableSort | null,
  valueOf: (row: T) => string | undefined,
): readonly T[] {
  if (sort === null) {
    return rows;
  }
  const direction = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = valueOf(left);
    const b = valueOf(right);
    // Une colonne sans valeur pour cette ligne ne remonte pas en tête : elle
    // reste au bout, dans les deux sens. Une ligne incomplète n'est pas une
    // ligne prioritaire.
    if (a === undefined || b === undefined) {
      return a === b ? 0 : a === undefined ? 1 : -1;
    }
    return direction * compareLabels(a, b);
  });
}
