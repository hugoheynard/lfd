import { PackingListDrawnEvent } from "../../channels/packing/packing-list-drawn.event.js";
import { ResupplyListDrawnEvent } from "../../channels/packing/resupply-list-drawn.event.js";
import type {
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
} from "../../domain/entities/production-day.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **La liste à coliser, en faits** — un par commande (plan
 * `colisage/colisage.md`, §11, B1–B2). Partagée par la clôture,
 * sa réannonce et le retirage, qui ne diffèrent que par les commandes qu'ils
 * passent.
 *
 * L'instantané est celui de la JOURNÉE, pas une relecture du commerce : la
 * réannonce republie ce que la clôture a figé, échéance comprise.
 */
export function packingListFactsOf(
  day: ServiceDay,
  orders: readonly ProductionOrderSnapshot[],
  drawnAt: Date,
  /** La dernière réouverture de la journée — cf. `PackingListDrawnEvent`. */
  reopenedAt: Date | null = null,
): readonly PackingListDrawnEvent[] {
  return orders.map(
    (order) =>
      new PackingListDrawnEvent(
        day.value,
        drawnAt,
        {
          orderId: order.orderId,
          reference: order.reference,
          customerLabel: order.customerLabel,
          fulfillmentMethod: order.fulfillmentMethod,
          dueAt: order.dueAt,
          clientele: order.clientele,
          siteId: order.siteId,
          lines: order.lines.map((line) => ({
            sku: line.sku,
            productName: line.productName,
            quantity: line.quantity,
          })),
        },
        reopenedAt,
      ),
  );
}

/**
 * **Les réassorts à coliser, en faits** — un par réassort d'un point SERVI
 * PAR TRANSFERT (réassort, lot R3b ; §13.4, Q1 révisée : le Labo ne passe pas
 * au colisage). Partagée par l'arrêt et sa réannonce ; le retirage n'en
 * publie aucun, il n'absorbe pas de réassort.
 */
export function resupplyListFactsOf(
  day: ServiceDay,
  resupplies: readonly ProductionResupplySnapshot[],
  drawnAt: Date,
  reopenedAt: Date | null,
): readonly ResupplyListDrawnEvent[] {
  return resupplies
    .filter((resupply) => resupply.servedByTransfer)
    .map(
      (resupply) =>
        new ResupplyListDrawnEvent(
          day.value,
          drawnAt,
          {
            resupplyId: resupply.resupplyId,
            siteId: resupply.siteId,
            siteLabel: resupply.siteLabel,
            name: resupply.name,
            lines: resupply.lines.map((line) => ({
              sku: line.sku,
              productName: line.productName,
              quantity: line.quantity,
            })),
          },
          reopenedAt,
        ),
    );
}
