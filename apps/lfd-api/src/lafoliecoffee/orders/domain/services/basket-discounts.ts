import type { CartAdjustment } from "@lfd/contracts";
import { chainBasketDiscounts, type BasketDiscountChain, type VatLine } from "@lfd/money";

import { MAX_BASKET_DISCOUNTS_PER_ORDER } from "../../../promotions/domain/promotion-overlap.js";
import { TooManyBasketDiscountsError } from "../errors/basket-discount-errors.js";

/**
 * **Les remises de panier d'une commande, dans leur ordre** — `documentation/promotions/promotions.md`, § 2.11
 * (point PANIER) et § 18.4, lot M1.
 *
 * L'arithmétique vit dans `@lfd/money` (`chainBasketDiscounts`) ; ce module
 * garde ce qui appartient à la COMMANDE : le plafond, et la traduction des
 * lignes du chemin `line_ht`. Le chemin `exact_ht` passe par
 * `composeExactOrder`, qui appelle {@link assertBasketDiscountCount} lui aussi.
 */

/** Plafond du nombre de remises de panier par commande (§ 18.8, arbitrage n° 5). */
export const MAX_BASKET_DISCOUNTS = MAX_BASKET_DISCOUNTS_PER_ORDER;

/**
 * Une remise de panier : son ajustement tel que saisi (pourcentage, ou
 * montant fixe HT) et les indices des lignes qu'elle couvre. L'ordre de la
 * liste qui les porte EST l'ordre d'application (`rank`, § 18.2).
 */
export interface OrderBasketDiscount {
  readonly adjustment: CartAdjustment;
  readonly coveredLines: readonly number[];
}

/** @throws {TooManyBasketDiscountsError} au-delà de {@link MAX_BASKET_DISCOUNTS}. */
export function assertBasketDiscountCount(discounts: readonly OrderBasketDiscount[]): void {
  if (discounts.length > MAX_BASKET_DISCOUNTS) {
    throw new TooManyBasketDiscountsError(discounts.length, MAX_BASKET_DISCOUNTS);
  }
}

/**
 * Les étapes d'une commande `line_ht` : montants HT, ventilés par taux sur
 * les restes HT. Ses montants se passent à `ventilateVat` en
 * `eligibleDiscounts`, avec les mêmes couvertures.
 *
 * @throws {TooManyBasketDiscountsError} au-delà de {@link MAX_BASKET_DISCOUNTS}.
 */
export function chainLineHtBasketDiscounts(
  lines: readonly VatLine[],
  discounts: readonly OrderBasketDiscount[],
): BasketDiscountChain {
  assertBasketDiscountCount(discounts);
  return chainBasketDiscounts(
    lines.map((line) => ({ amountCents: line.htCents, vatRate: line.vatRate })),
    discounts,
    "line_ht",
  );
}
