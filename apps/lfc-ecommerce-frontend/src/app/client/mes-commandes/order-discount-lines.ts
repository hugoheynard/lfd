import type { DiscountLabelView } from '@lfd/contracts';

import type { RowSource } from './order-rows';

/**
 * **Une remise d'une commande qui en porte plusieurs** (plan des promotions,
 * § 18.6, M7 — décision de Hugo du 2026-10-31, option c).
 *
 * Chaque remise a sa propre assiette, et la vue ne la sert pas : l'ancienne
 * mention « −X sur Y éligibles » écrivait alors la SOMME des remises sur
 * l'union des lignes couvertes, l'assiette d'aucune. Le tiroir dit donc une
 * ligne par remise, sans base, comme le mail et le panier.
 */
export interface HistoryDiscountLine {
  /** Le libellé figé ; absent = repli sur le mot de l'écran. */
  readonly label?: DiscountLabelView;
  /** Le montant, positif, dans l'unité du total de la ligne (HT au compte, TTC sinon). */
  readonly cents: number;
}

/** Les remises, à partir de deux ; vide sinon — la remise unique garde son affichage. */
export function discountLinesOf(order: RowSource): {
  discountLines?: readonly HistoryDiscountLine[];
} {
  const discounts = order.discounts;
  if (discounts === undefined || discounts.length < 2) {
    return {};
  }
  const pretax = order.settlement === 'account';
  return {
    discountLines: discounts.map((discount) => ({
      ...(discount.label === undefined ? {} : { label: discount.label }),
      cents: pretax ? discount.amountCents : (discount.amountTtcCents ?? discount.amountCents),
    })),
  };
}
