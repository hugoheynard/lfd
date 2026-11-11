import type { GeneralDiscountView } from '@lfd/contracts';

import {
  discountAfter,
  tieredSkusOf,
  type AmendmentDiff,
  type AmendmentEdit,
  type AmendmentState,
} from './amendment-diff';
import { toLines } from './draft-prices';
import { articleDiscount, discountBpFor, type DiscountArticle } from './general-discount-pricing';
import { discountLabel } from './general-discount-reading';

/**
 * **Une ligne de la table d'avenant, dite** : son étiquette (« prix changé »,
 * « suit la remise », « passe à −35 % »…) et le prix d'après quand l'écran
 * sait le calculer. Pur.
 */

/** L'étiquette d'une ligne de la table ; `changed: false` = un repère, pas un changement. */
export interface RowLabel {
  readonly label: string;
  readonly changed: boolean;
}

/**
 * **L'étiquette d'une ligne** : « prix changé », « prix ajouté », « prix
 * retiré », « suit la remise » (un prix retiré que la remise couvre — Q1),
 * « passe à −35 % », « sort de la remise », ou le repère « à paliers ».
 * `null` = rien à dire.
 */
export function rowLabel(
  article: Pick<DiscountArticle, 'sku' | 'categoryPath'>,
  state: AmendmentState,
  edit: AmendmentEdit,
  diff: AmendmentDiff,
): RowLabel | null {
  const after = discountAfter(state, diff);
  const bpAfter = after === null ? null : discountBpFor(after, article);
  const change = diff.firm.get(article.sku);
  if (change !== undefined) {
    if (change.kind === 'changed') {
      return { label: 'prix changé', changed: true };
    }
    if (change.kind === 'added') {
      return { label: 'prix ajouté', changed: true };
    }
    return { label: bpAfter === null ? 'prix retiré' : 'suit la remise', changed: true };
  }
  if (tieredSkusOf(state).has(article.sku)) {
    return { label: 'à paliers', changed: false };
  }
  if (edit.firm.has(article.sku)) {
    return null;
  }
  const before = state.generalDiscount;
  const bpBefore = before === null ? null : discountBpFor(before, article);
  if (bpBefore === bpAfter) {
    return null;
  }
  return bpAfter === null
    ? { label: 'sort de la remise', changed: true }
    : { label: `passe à ${discountLabel(bpAfter)}`, changed: true };
}

/** Le prix d'après calculé à l'écran, avec la limite. */
export interface LocalAfter {
  readonly millicents: number;
  readonly floored: boolean;
}

/**
 * **« Après l'avenant » à l'étape 1**, pour les seuls prix que la mercuriale
 * fait : le prix ferme saisi, ou la remise sur le prix de base, relevés par la
 * limite — l'arithmétique de la caisse (`@lfd/money`, via `articleDiscount`).
 * `null` = l'article sort de la mercuriale : seule la caisse sait son prix
 * (recalculé à la vérification).
 */
export function localAfter(
  article: DiscountArticle,
  edit: AmendmentEdit,
  after: GeneralDiscountView | null,
): LocalAfter | null {
  const typed = toLines(edit.firm).find((line) => line.sku === article.sku);
  if (typed !== undefined) {
    const floor = article.floorMillicents;
    const floored = floor !== null && typed.unitPriceMillicents < floor;
    return { millicents: floored ? floor : typed.unitPriceMillicents, floored };
  }
  const cut = after === null ? null : articleDiscount(after, article);
  return cut === null ? null : { millicents: cut.finalMillicents, floored: cut.floored };
}
