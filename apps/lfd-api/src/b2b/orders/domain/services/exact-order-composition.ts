import type { CartAdjustment, DeliveryVatMode } from "@lfd/contracts";
import { composeTtcOrder, saleQuantity, type SaleUnit, type TtcOrderComposition } from "@lfd/money";

import { AmbiguousBasketDiscountsError } from "../errors/basket-discount-errors.js";
import { assertBasketDiscountCount, type OrderBasketDiscount } from "./basket-discounts.js";

/**
 * **La composition d'une commande `exact_ht`** — l'unique traduction de la
 * commande vers `composeTtcOrder` (`@lfd/money`), plan
 * `documentation/pricing/plan-centime-particuliers.md` (§ 4, § 5).
 *
 * Le devis de la boutique, la composition de la passation et de la révision,
 * et l'agrégat appellent CETTE fonction : la remise, le bon et le port d'un
 * particulier se calculent en TTC une seule fois, et trois traductions
 * finiraient par diverger (§ 5, « une seule fonction de conversion »).
 *
 * Les réglages arrivent tels que saisis — la remise du point et le barème de
 * la zone en HT ou en pourcentage, figés comme trace — et le bon à sa valeur
 * faciale TTC (§ 10, Q2).
 */
export interface ExactOrderInput {
  readonly lines: readonly {
    readonly unitPriceMillicents: number;
    /** Des pièces, ou des grammes si `saleUnit = weight` (le prix est alors au kilo). */
    readonly quantity: number;
    readonly saleUnit: SaleUnit;
    readonly vatRate: number;
    /** Absent = éligible, comme sur la ligne de commande. */
    readonly pickupDiscountEligible?: boolean | undefined;
  }[];
  /** La remise unique d'hier, sur les lignes `pickupDiscountEligible`. */
  readonly discountAdjustment: CartAdjustment | null;
  /**
   * Les remises de panier, dans leur ordre d'application (plan des
   * promotions, § 18.4) — chacune dit ses lignes. Une liste à un élément
   * rend la remise unique au centime. Exclusive de `discountAdjustment`, qui
   * vaut alors `null`.
   */
  readonly basketDiscounts?: readonly OrderBasketDiscount[] | undefined;
  readonly deliveryFeeAdjustment: CartAdjustment | null;
  /** `null` = commande d'avant le réglage, donc `standard` — comme `deliveryExtraOf`. */
  readonly deliveryVatMode: DeliveryVatMode | null;
  /** La valeur faciale TTC du bon, `0` sans bon. Bornée par la composition. */
  readonly voucherFaceCents: number;
  /**
   * Le TTC du port en montant fixe déjà figé sur la commande — fourni par le
   * bon de livraison partiel seul, qui le reprend sans reconversion (§ 5).
   * Absent : le barème est converti.
   */
  readonly deliveryFeeFrozenTtcCents?: number | undefined;
}

/**
 * @throws {TooManyBasketDiscountsError} plus de remises qu'une commande n'en porte.
 * @throws {AmbiguousBasketDiscountsError} remise unique et liste à la fois.
 */
export function composeExactOrder(input: ExactOrderInput): TtcOrderComposition {
  if (input.basketDiscounts !== undefined) {
    if (input.discountAdjustment !== null) {
      throw new AmbiguousBasketDiscountsError();
    }
    assertBasketDiscountCount(input.basketDiscounts);
  }
  return composeTtcOrder({
    lines: input.lines.map((line) => ({
      unitMillicents: line.unitPriceMillicents,
      quantity: saleQuantity(line.quantity, line.saleUnit),
      vatRate: line.vatRate,
      discountEligible: line.pickupDiscountEligible,
    })),
    pickupDiscount: input.discountAdjustment ?? undefined,
    basketDiscounts: input.basketDiscounts,
    voucherCents: input.voucherFaceCents,
    deliveryFee:
      input.deliveryFeeAdjustment === null
        ? undefined
        : {
            adjustment: input.deliveryFeeAdjustment,
            vatMode: input.deliveryVatMode === "follows_goods" ? "followsGoods" : "standard",
            frozenTtcCents: input.deliveryFeeFrozenTtcCents,
          },
  });
}

/**
 * Le TTC de chaque ligne, tel que la composition le rend — l'unité dans
 * laquelle les plans de remise d'une commande `exact_ht` se comparent
 * (plan des promotions, M7, décision du 2026-10-31).
 */
export function exactLineTtcsOf(lines: ExactOrderInput["lines"]): readonly number[] {
  return composeExactOrder({
    lines,
    discountAdjustment: null,
    deliveryFeeAdjustment: null,
    deliveryVatMode: null,
    voucherFaceCents: 0,
  }).lines.map((line) => line.ttcCents);
}
