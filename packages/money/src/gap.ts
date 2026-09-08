/**
 * **L'écart entre deux prix, en points de base.**
 *
 * Une division, un arrondi. Ça ne mérite pas un module — et c'est précisément
 * pourquoi il en fallait un : au 2026-09-08, la même formule existait en
 * **cinq exemplaires**, avec **trois réponses différentes** au seul cas qui
 * compte, celui où le prix de référence vaut zéro.
 *
 * | Où | Quand le canonique est nul |
 * | --- | --- |
 * | `template-grid.gapToCatalogBp` (front) | `null` |
 * | `mercuriale-rows.gapBp` (front) | `null` — fonction identique, JSDoc compris |
 * | `quote-bench.variationBp` (front) | `0` |
 * | `volume-tier-prices.discountBpOf` (back) | `0`, et le résultat borné à zéro |
 * | `company-pricing.query` (back) | la ligne est **exclue** de la moyenne |
 *
 * Aucune n'était fausse. Elles ne disaient simplement pas la même chose, et
 * deux écrans côte à côte pouvaient afficher deux écarts pour un même article.
 *
 * ## La convention, écrite une fois
 *
 * **Positif = le client paie MOINS cher.** C'est l'inverse du signe
 * arithmétique de la différence, et c'est ce qu'un commercial lit : « −18,8 % »
 * à l'écran est une remise, donc un écart positif ici. Les fonctions
 * d'affichage inversent ; celle-ci ne ment pas sur ce qu'elle calcule.
 */

/** L'unité : 10 000 points de base font 100 %. */
const BP_UNIT = 10_000;

/**
 * L'écart au prix de référence, **signé**. `null` quand il n'y a pas de
 * référence — un article que le catalogue ne pousse plus.
 *
 * `null` et non `0` : zéro signifie « même prix », ce qui est une information.
 * L'absence de référence n'en est pas une, et afficher « −100 % » pour un
 * article sans tarif serait pire que rien.
 */
export function gapBp(referenceMillicents: number | null, finalMillicents: number): number | null {
  if (referenceMillicents === null || referenceMillicents <= 0) {
    return null;
  }
  return Math.round(((referenceMillicents - finalMillicents) / referenceMillicents) * BP_UNIT);
}

/**
 * L'écart vu comme une **remise**, jamais négatif.
 *
 * Ce que la grille des paliers affiche : un palier qui ne descend pas le prix
 * n'accorde rien, et « −0 % » se lit mieux que « +3 % » sur une colonne dont
 * l'entête dit « remise ». La différence avec {@link gapBp} n'est pas un détail
 * d'arrondi, c'est une décision d'affichage — d'où deux fonctions plutôt qu'un
 * drapeau.
 */
export function discountBp(referenceMillicents: number, finalMillicents: number): number {
  return Math.max(0, gapBp(referenceMillicents, finalMillicents) ?? 0);
}

/**
 * La moyenne des écarts connus, ou `null` s'il n'y en a aucun.
 *
 * **Pondérée par rien**, et c'est délibéré : pondérer par une quantité qu'on
 * n'a pas mesurée donnerait un chiffre qui ressemble à une mesure. Les écarts
 * absents sont **écartés**, pas comptés pour zéro — un article sans tarif de
 * référence ne tire pas la moyenne vers « même prix ».
 */
export function averageGapBp(gaps: readonly (number | null)[]): number | null {
  const known = gaps.filter((gap): gap is number => gap !== null);
  if (known.length === 0) {
    return null;
  }
  return Math.round(known.reduce((sum, gap) => sum + gap, 0) / known.length);
}
