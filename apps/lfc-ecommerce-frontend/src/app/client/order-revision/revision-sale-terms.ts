import type { ShopItemView } from '@lfd/contracts';

import { firstQuantityOf, isSoldByWeight, quantityLabel, stepOf } from '../shop/sale-unit';
import type { AddedArticle, RevisionLine } from './revision-draft';

/**
 * **Comment une ligne de la modification se saisit** (plan
 * `documentation/pricing/vente-au-poids.md`, P5) : une pièce au pas d'un,
 * ou au poids les grammes au pas et au minimum de l'article, lus au catalogue
 * de la boutique. Le serveur reste juge : rien n'est corrigé ici.
 */

/** Le champ d'une ligne : son pas, son plancher, et au poids la quantité dite (« 500 g »). */
export interface RevisionQuantityField {
  readonly step: number;
  readonly minimum: number;
  /** `null` pour une pièce, dont le champ dit déjà tout. */
  readonly weight: string | null;
}

/**
 * Le champ d'une ligne. Un article au poids que la boutique ne sert plus (ou
 * pas encore chargé) avance au gramme : c'est le serveur qui juge le pas.
 */
export function weightFieldOf(
  line: RevisionLine,
  item: ShopItemView | undefined,
): RevisionQuantityField {
  if (line.saleUnit !== 'weight') {
    return { step: 1, minimum: 1, weight: null };
  }
  return {
    step: item === undefined ? 1 : (stepOf(item) ?? 1),
    minimum: item === undefined ? 1 : (firstQuantityOf(item) ?? 1),
    weight: quantityLabel(line.quantity, 'weight'),
  };
}

/** Un article de la boutique, tel qu'on l'ajoute à la commande : au poids, son pas et son minimum. */
export function addedArticleOf(item: ShopItemView): AddedArticle {
  const base = { sku: item.sku, name: item.name };
  if (!isSoldByWeight(item)) {
    return base;
  }
  const step = stepOf(item);
  const first = firstQuantityOf(item);
  return {
    ...base,
    saleUnit: 'weight',
    ...(step === null ? {} : { step }),
    ...(first === null ? {} : { first }),
  };
}
