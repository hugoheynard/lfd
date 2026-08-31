import type { PriceTemplateLineView, TemplateTierPayload } from '@lfd/contracts';

/**
 * **Les dérivations de la grille**, hors du composant : des fonctions pures que
 * l'on peut éprouver sans Angular, et dont chacune porte une décision
 * d'affichage qui mérite d'être vérifiée seule.
 */

/**
 * Une grille à **un seul palier, à partir de 1**, est un prix fixe.
 *
 * C'est la seule différence entre les deux façons de saisir, et elle se lit
 * ici — la base, elle, ne les distingue pas. Le dire à l'écran évite qu'un
 * commercial cherche « où est le mode prix fixe » : il y est déjà.
 */
export function isFlatPrice(tiers: readonly TemplateTierPayload[]): boolean {
  return tiers.length === 1 && tiers[0]?.minQuantity === 1;
}

/**
 * L'écart au tarif catalogue, en points de base. **Signé** : positif = moins
 * cher que le catalogue.
 *
 * `null` sans tarif catalogue — un article que le PIM ne pousse plus. Afficher
 * « −100 % » serait pire que rien : ce n'est pas une remise, c'est une absence.
 */
export function gapToCatalogBp(
  catalogPriceMillicents: number | null,
  unitPriceMillicents: number,
): number | null {
  if (catalogPriceMillicents === null || catalogPriceMillicents <= 0) {
    return null;
  }
  return Math.round(
    ((catalogPriceMillicents - unitPriceMillicents) / catalogPriceMillicents) * 10_000,
  );
}

/**
 * Le prix **d'entrée** d'une ligne : celui du plus petit palier.
 *
 * C'est lui qu'on met en colonne face au catalogue. Le prix du plus GROS palier
 * serait le plus flatteur, et c'est précisément pour ça qu'il ne convient pas :
 * un client qui commande peu paie l'entrée, et c'est ce qu'il faut voir.
 */
export function entryPriceCents(tiers: readonly TemplateTierPayload[]): number {
  return tiers[0]?.unitPriceMillicents ?? 0;
}

/**
 * **Ce que la grille coûte face au catalogue, sur l'ensemble des lignes.**
 *
 * La moyenne des écarts d'entrée, pondérée par rien — un gabarit ne connaît pas
 * les volumes, et pondérer par une quantité inventée donnerait un chiffre qui
 * ressemble à une mesure. `null` quand aucune ligne n'a de tarif catalogue.
 */
export function averageGapBp(lines: readonly PriceTemplateLineView[]): number | null {
  const gaps = lines
    .map((line) => gapToCatalogBp(line.catalogPriceMillicents, entryPriceCents(line.tiers)))
    .filter((gap): gap is number => gap !== null);
  if (gaps.length === 0) {
    return null;
  }
  return Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
}

/** Combien de règles ce gabarit posera : un palier = une règle. */
export function ruleCount(lines: readonly PriceTemplateLineView[]): number {
  return lines.reduce((count, line) => count + line.tiers.length, 0);
}
