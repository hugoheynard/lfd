import type { CartAdjustment } from "@lfd/contracts";

import { frozenBasketDiscountsOf, type FrozenBasketDiscount } from "../frozen-basket-discounts.js";

/**
 * Les remises d'une commande NON reprise, telles que le repli les rend : la
 * colonne `discount_adjustment` comme une remise de rang 1 (vide sans
 * ajustement). Par la fonction de production, pas par un littéral : c'est
 * elle que les lecteurs appellent.
 */
export function columnDiscounts(
  adjustment: CartAdjustment | null,
): readonly FrozenBasketDiscount[] {
  return frozenBasketDiscountsOf([], { discountPromotionId: null, discountAdjustment: adjustment });
}

/** Une remise relue dans `order_discounts` (commande reprise ou passée après M3). */
export function tableDiscount(
  orderDiscountId: string,
  adjustment: CartAdjustment,
  coveredSkus: readonly string[],
): FrozenBasketDiscount {
  return {
    orderDiscountId,
    promotionId: `promo_${orderDiscountId}`,
    adjustment,
    label: null,
    coveredSkus,
  };
}
