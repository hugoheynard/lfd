import type { CartAdjustment } from "@lfd/contracts";

import type {
  FrozenBasketPromotion,
  RevisableOrder,
  RevisionChange,
} from "../entities/order-revision.js";
import type { OrderToPlace } from "../entities/order-shapes.js";
import { FulfillmentChangeAltersPromotionError } from "../errors/fulfillment-promotion-errors.js";

/** Les changements qui peuvent faire entrer ou sortir une promotion conditionnée par l'acheminement. */
const FULFILLMENT_CHANGES: ReadonlySet<RevisionChange> = new Set(["method", "pickup_point"]);

/**
 * **L9 — changer d'acheminement ne change pas les promotions** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.8, étendu à un ENSEMBLE au § 18.5, lot M3). Seulement quand le mode ou
 * le point change : une révision qui garde l'acheminement se recompose comme
 * avant.
 *
 * La comparaison porte sur la liste ORDONNÉE des remises de panier, rang par
 * rang : l'identifiant figé de la promotion, ou, pour une remise reprise sans
 * identifiant (commande d'avant L9, `NULL` = « inconnu »), son ajustement
 * figé — même effet = accepté. Une remise ajoutée, retirée ou remplacée est
 * refusée en nommant laquelle.
 *
 * L'« avant » se lit dans `order_discounts` quand la commande y a des lignes
 * actives ; sinon dans les colonnes `discount_*` figées, comme UNE remise de
 * rang 1 (§ 18.9). L'« après » est la remise que la nouvelle composition
 * retient — une seule jusqu'à M7. Les deux se lisent par la PRÉSENCE d'un
 * ajustement, pas par le montant : une remise arrondie à zéro n'a pas de
 * ligne en table, mais reste la promotion de la commande.
 *
 * @throws {FulfillmentChangeAltersPromotionError}
 */
export function ensureFulfillmentKeepsPromotion(
  order: RevisableOrder,
  state: OrderToPlace,
  changes: readonly RevisionChange[],
): void {
  if (!changes.some((change) => FULFILLMENT_CHANGES.has(change))) {
    return;
  }
  const before = promotionsBefore(order);
  const after = promotionsAfter(state);
  const length = Math.max(before.length, after.length);
  for (let rank = 0; rank < length; rank += 1) {
    const had = before[rank];
    const has = after[rank];
    if (had === undefined && has !== undefined) {
      throw new FulfillmentChangeAltersPromotionError(order.orderId, "adds", has.label);
    }
    if (had !== undefined && has === undefined) {
      throw new FulfillmentChangeAltersPromotionError(order.orderId, "removes", had.label);
    }
    if (had !== undefined && has !== undefined && !samePromotion(had, has)) {
      throw new FulfillmentChangeAltersPromotionError(order.orderId, "replaces", had.label);
    }
  }
}

/** La table si elle a des lignes actives, sinon les colonnes figées. */
function promotionsBefore(order: RevisableOrder): readonly FrozenBasketPromotion[] {
  if (order.activeDiscounts.length > 0) {
    return order.activeDiscounts;
  }
  if (order.discountAdjustment === null) {
    return [];
  }
  return [
    { promotionId: order.discountPromotionId, adjustment: order.discountAdjustment, label: null },
  ];
}

function promotionsAfter(state: OrderToPlace): readonly FrozenBasketPromotion[] {
  if (state.discountAdjustment === null) {
    return [];
  }
  return [
    {
      promotionId: state.discountPromotionId,
      adjustment: state.discountAdjustment,
      label: state.discountLabel?.fr ?? null,
    },
  ];
}

function samePromotion(had: FrozenBasketPromotion, has: FrozenBasketPromotion): boolean {
  return had.promotionId === null
    ? sameAdjustment(had.adjustment, has.adjustment)
    : had.promotionId === has.promotionId;
}

function sameAdjustment(a: CartAdjustment | null, b: CartAdjustment | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.mode === "percent" && b.mode === "percent") {
    return a.bp === b.bp;
  }
  if (a.mode === "amount" && b.mode === "amount") {
    return a.cents === b.cents;
  }
  return false;
}
