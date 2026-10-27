import type { CartAdjustment, DeliveryVatMode } from "@lfd/contracts";
import { composeTtcOrder, type TtcOrderComposition } from "@lfd/money";

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
    readonly quantity: number;
    readonly vatRate: number;
    /** Absent = éligible, comme sur la ligne de commande. */
    readonly pickupDiscountEligible?: boolean | undefined;
  }[];
  readonly discountAdjustment: CartAdjustment | null;
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

export function composeExactOrder(input: ExactOrderInput): TtcOrderComposition {
  return composeTtcOrder({
    lines: input.lines.map((line) => ({
      unitMillicents: line.unitPriceMillicents,
      quantity: line.quantity,
      vatRate: line.vatRate,
      discountEligible: line.pickupDiscountEligible,
    })),
    pickupDiscount: input.discountAdjustment ?? undefined,
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
