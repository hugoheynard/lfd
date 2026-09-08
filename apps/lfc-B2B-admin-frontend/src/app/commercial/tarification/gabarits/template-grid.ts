import { averageGapBp as averageBp, gapBp } from '@lfd/money';
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
 * Un alias de `gapBp` (`@lfd/money`) : le corps était identique à celui de
 * `mercuriale-rows.ts`, JSDoc compris. Le nom local reste parce que c'est celui
 * que ce dossier emploie — le catalogue y est LA référence, et le dire dans le
 * nom vaut mieux que de le supposer.
 */
export const gapToCatalogBp = gapBp;

/**
 * Le prix **d'entrée** d'une ligne : celui du plus petit palier.
 *
 * C'est lui qu'on met en colonne face au catalogue. Le prix du plus GROS palier
 * serait le plus flatteur, et c'est précisément pour ça qu'il ne convient pas :
 * un client qui commande peu paie l'entrée, et c'est ce qu'il faut voir.
 */
export function entryPriceMillicents(tiers: readonly TemplateTierPayload[]): number {
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
  // La moyenne et l'écart viennent de `@lfd/money` : la même paire existait
  // côté serveur, et deux écrans côte à côte pouvaient annoncer deux chiffres.
  return averageBp(
    lines.map((line) =>
      gapToCatalogBp(line.catalogPriceMillicents, entryPriceMillicents(line.tiers)),
    ),
  );
}

/** Combien de règles ce gabarit posera : un palier = une règle. */
export function ruleCount(lines: readonly PriceTemplateLineView[]): number {
  return lines.reduce((count, line) => count + line.tiers.length, 0);
}
