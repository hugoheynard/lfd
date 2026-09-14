import type { PackingLine, PackingResource, PackingSheet } from '@lfd/contracts';

/**
 * **Ce que la recherche du poste surligne** — des fonctions pures : des entrées,
 * une sortie, aucun signal, aucune injection.
 *
 * 🔴 **La recherche SURLIGNE, elle ne filtre pas.** Filtrer casserait la
 * balance : le reste à répartir porte sur la journée entière, et une liste
 * réduite ferait lire un reste qui ne correspond à rien de ce qui est affiché.
 *
 * Et elle ne fait **aucun total** (retirés le 2026-09-14) : ces fonctions
 * choisissent ce qui est désigné, elles ne produisent aucun chiffre. Sorties de
 * `Colisage` le 2026-09-14 pour s'éprouver sans monter l'écran.
 */

/**
 * Le terme de recherche, réduit à ce qui se compare : minuscules, sans accents.
 *
 * Le fournil tape « croissant » sur une étiquette qui dit « Croissant », et
 * « pate a choux » sur une fiche qui dit « Pâte à choux ». `NFD` sépare la
 * lettre de son accent, et la plage `U+0300–U+036F` retire les diacritiques
 * combinants — ce que `toLowerCase()` seul ne fait pas.
 */
export function normaliseTerm(term: string): string {
  return term.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase().trim();
}

/**
 * Cet article répond-il au terme ? Sur le NOM **et** sur le SKU : le fournil
 * tape « croissant », un poste qui lit une étiquette de bac tape la référence
 * article. Un terme vide ne désigne rien.
 */
export function matchesTerm(normalisedTerm: string, sku: string, productName: string): boolean {
  if (normalisedTerm === '') {
    return false;
  }
  return (
    normaliseTerm(productName).includes(normalisedTerm) ||
    normaliseTerm(sku).includes(normalisedTerm)
  );
}

/**
 * **Les SKU qu'un terme normalisé désigne**, tirés des lignes de TOUTES les
 * commandes et de la marchandise.
 *
 * Un seul ensemble pour les trois colonnes : elles doivent se surligner ensemble
 * ou l'outil ment. Les résoudre chacune de son côté aurait laissé une commande se
 * distinguer pour un article que la marchandise ne montrerait pas — et c'est
 * justement le rapprochement des deux qu'on est venu lire.
 */
export function searchHits(
  normalisedTerm: string,
  sheets: readonly PackingSheet[],
  resources: readonly PackingResource[],
): ReadonlySet<string> {
  const skus = new Set<string>();
  if (normalisedTerm === '') {
    return skus;
  }
  for (const item of resources) {
    if (matchesTerm(normalisedTerm, item.sku, item.productName)) {
      skus.add(item.sku);
    }
  }
  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      if (matchesTerm(normalisedTerm, line.sku, line.productName)) {
        skus.add(line.sku);
      }
    }
  }
  return skus;
}

/**
 * **Les lignes trouvées de chaque commande**, telles que servies, par référence —
 * seulement les commandes qui en ont.
 *
 * 🔴 Leurs quantités s'affichent une à une, JAMAIS additionnées : c'était « en
 * attend 24 », une somme faite à la frappe. Une commande présente dans la table
 * est surlignée ; c'est un filtre de texte, pas un compte.
 */
export function hitLinesByOrder(
  hits: ReadonlySet<string>,
  sheets: readonly PackingSheet[],
): ReadonlyMap<string, readonly PackingLine[]> {
  const found = new Map<string, readonly PackingLine[]>();
  if (hits.size === 0) {
    return found;
  }
  for (const sheet of sheets) {
    const lines = sheet.lines.filter((line) => hits.has(line.sku));
    if (lines.length > 0) {
      found.set(sheet.reference, lines);
    }
  }
  return found;
}

/**
 * 🔴 **Le terme ne trouve rien dans la pile affichée, mais quelque chose dans
 * l'autre.**
 *
 * Sans cet avis, le sélecteur de pile rendrait faux ce que la recherche
 * promet : un article présent seulement dans des commandes déjà prêtes
 * n'apparaîtrait nulle part, et on conclurait que personne ne le demande. Un oui
 * ou un non, jamais « combien » : ce serait un compte fait par l'écran.
 */
export function foundOnlyElsewhere(
  found: ReadonlyMap<string, readonly PackingLine[]>,
  shown: readonly PackingSheet[],
  other: readonly PackingSheet[],
): boolean {
  return (
    !shown.some((sheet) => found.has(sheet.reference)) &&
    other.some((sheet) => found.has(sheet.reference))
  );
}
