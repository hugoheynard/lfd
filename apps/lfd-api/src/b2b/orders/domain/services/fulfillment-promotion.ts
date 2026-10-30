import type { CartAdjustment } from "@lfd/contracts";

import type { RevisableOrder, RevisionChange } from "../entities/order-revision.js";
import type { OrderToPlace } from "../entities/order-shapes.js";
import { FulfillmentChangeAltersPromotionError } from "../errors/fulfillment-promotion-errors.js";

/** Les changements qui peuvent faire entrer ou sortir une promotion conditionnée par l'acheminement. */
const FULFILLMENT_CHANGES: ReadonlySet<RevisionChange> = new Set(["method", "pickup_point"]);

/**
 * **L9 — changer d'acheminement ne change pas la promotion** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.8). Seulement quand le mode ou le point change : une révision qui garde
 * l'acheminement se recompose comme avant.
 *
 * La comparaison porte sur l'identifiant figé de la promotion panier. Une
 * commande d'avant L9 n'en a pas (`NULL` = « inconnu ») : on compare alors
 * l'ajustement figé de sa remise à celui que le nouvel acheminement
 * produirait — même effet (ou aucun des deux) = accepté. Une commande d'après
 * L9 sans promotion a aussi un ajustement `null` : les deux règles s'accordent.
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
  const had = order.discountAdjustment !== null;
  const has = state.discountAdjustment !== null;
  if (had !== has) {
    throw new FulfillmentChangeAltersPromotionError(order.orderId, had ? "removes" : "adds");
  }
  if (!had) {
    return;
  }
  const same =
    order.discountPromotionId === null
      ? sameAdjustment(order.discountAdjustment, state.discountAdjustment)
      : order.discountPromotionId === state.discountPromotionId;
  if (!same) {
    throw new FulfillmentChangeAltersPromotionError(order.orderId, "replaces");
  }
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
