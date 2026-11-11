import type { RevisableOrder } from "../../revision/domain/entities/order-revision.js";
import type { OrderFulfillmentInput } from "../entities/order-shapes.js";
import {
  CounterLinkSettlementRefusedError,
  EntryShortcutOffShelfError,
  ShelfOrderNotPickupError,
  ShelfOrderNotTodayError,
  ShelfOrderRouteChangeError,
} from "../errors/shelf-order-errors.js";
import type {
  OrderEntryOrigin,
  OrderEntryShortcut,
  OrderSupply,
  OrderSupplyDecision,
} from "../value-objects/order-supply.js";
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
 * **La marque d'une saisie de l'équipe** (plan du jour J, §11.1, lot L4 ; le
 * raccourci, lot L6) : ce que l'écran envoie, `planned` s'il n'envoie rien.
 * Le « Retrait immédiat » n'existe que sur une `shelf` — la forme
 * {@link OrderSupplyDecision} le rend inexprimable ailleurs, et ce refus le
 * dit au vendeur plutôt que de l'oublier en silence. Le retrait, la journée
 * et le point sont ensuite jugés par l'agrégat ({@link ensureSupplyFits}).
 *
 * @throws {EntryShortcutOffShelfError} un raccourci sur une commande programmée.
 */
export function staffSupplyOf(
  requested: OrderSupply | undefined,
  shortcut: OrderEntryShortcut | undefined,
  today: string,
): OrderSupplyDecision {
  if (requested === "shelf") {
    return { supply: "shelf", today, entryShortcut: shortcut ?? null };
  }
  if (shortcut !== undefined) {
    throw new EntryShortcutOffShelfError();
  }
  return { supply: "planned" };
}

/**
 * **La saisie vient-elle du comptoir ?** — l'origine déclarée `counter`, ou le
 * « Retrait immédiat », qui n'existe qu'au comptoir (Hugo, 2026-11-03, E4
 * étendu du plan `documentation/commandes/passation/commande-passee-par-l-equipe.md`).
 * Le raccourci reste un signal à lui seul : un écran plus ancien qui ne
 * déclare pas l'origine est toujours couvert.
 */
export function isCounterEntry(
  origin: OrderEntryOrigin | undefined,
  shortcut: OrderEntryShortcut | undefined,
): boolean {
  return origin === "counter" || shortcut === "immediate_pickup";
}

/**
 * **L'origine que garde une saisie de l'équipe** (Hugo, 2026-11-04) : le
 * comptoir si {@link isCounterEntry}, le commercial sinon — l'écran du
 * commercial n'envoie aucune origine.
 */
export function staffEntryOriginOf(
  origin: OrderEntryOrigin | undefined,
  shortcut: OrderEntryShortcut | undefined,
): OrderEntryOrigin {
  return isCounterEntry(origin, shortcut) ? "counter" : "commercial";
}

/**
 * **Le comptoir ne règle qu'au compte** (Hugo, 2026-11-03, E4 du plan
 * `documentation/commandes/passation/commande-passee-par-l-equipe.md`) — sur la vitrine
 * comme sur une commande programmée, dès que la saisie vient du comptoir
 * ({@link isCounterEntry}).
 *
 * @throws {CounterLinkSettlementRefusedError} un lien de règlement au comptoir.
 */
export function ensureCounterSettlement(settlement: "account" | "link", atCounter: boolean): void {
  if (atCounter && settlement === "link") {
    throw new CounterLinkSettlementRefusedError();
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
