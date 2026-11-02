import type { RevisableOrder } from "../entities/order-revision.js";
import type { OrderFulfillmentInput } from "../entities/order-shapes.js";
import {
  ShelfOrderNotPickupError,
  ShelfOrderNotTodayError,
  ShelfOrderRouteChangeError,
} from "../errors/shelf-order-errors.js";
import type { OrderSupplyDecision } from "../value-objects/order-supply.js";
import type { RevisedFulfillment } from "./fulfillment-promotion.js";

/**
 * **L'invariant d'une commande sur stock, à la passation** (plan du jour J,
 * §11.1, §12 « l'agrégat reçoit aujourd'hui ») : un retrait, pour une journée
 * donnée, et cette journée est aujourd'hui. Une commande `shelf` datée de
 * demain ne serait jamais cuite — le plan ne la voit pas.
 *
 * @throws {ShelfOrderNotPickupError} une livraison.
 * @throws {ShelfOrderNotTodayError} sans journée, ou une autre qu'aujourd'hui.
 */
export function ensureSupplyFits(
  decision: OrderSupplyDecision,
  fulfillment: OrderFulfillmentInput,
  requestedDeliveryDate: Date | null,
): void {
  if (decision.supply !== "shelf") {
    return;
  }
  if (fulfillment.method !== "pickup") {
    throw new ShelfOrderNotPickupError();
  }
  const serviceDay = dayOf(requestedDeliveryDate);
  if (serviceDay !== decision.today) {
    throw new ShelfOrderNotTodayError(serviceDay, decision.today);
  }
}

/**
 * **La révision d'une commande sur stock rejuge l'invariant** (§13, sérieux) :
 * ses lignes et ses quantités changent, ni son mode, ni sa journée, ni son
 * point. Ce n'est pas `isQuantitiesOnly`, qui refuserait un article nouveau.
 *
 * @throws {ShelfOrderRouteChangeError} le mode, la journée ou le point change.
 */
export function ensureShelfKeepsRoute(order: RevisableOrder, after: RevisedFulfillment): void {
  if (order.supply !== "shelf") {
    return;
  }
  if (after.method !== order.fulfillment.method) {
    throw new ShelfOrderRouteChangeError(order.orderId, "method");
  }
  if (after.serviceDay !== order.serviceDay) {
    throw new ShelfOrderRouteChangeError(order.orderId, "date");
  }
  if (after.pickupSiteId !== (order.fulfillment.pickupAddress?.siteId ?? null)) {
    throw new ShelfOrderRouteChangeError(order.orderId, "pickup_point");
  }
}

// `@db.Date` composé à minuit UTC : le jour se relit tel quel.
function dayOf(date: Date | null): string | null {
  return date === null ? null : date.toISOString().slice(0, 10);
}
