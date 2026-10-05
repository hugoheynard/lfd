import { PackingListDrawnEvent } from "../../channels/packing/packing-list-drawn.event.js";
import type { ProductionOrderSnapshot } from "../../domain/entities/production-day.js";
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
): readonly PackingListDrawnEvent[] {
  return orders.map(
    (order) =>
      new PackingListDrawnEvent(day.value, drawnAt, {
        orderId: order.orderId,
        reference: order.reference,
        customerLabel: order.customerLabel,
        fulfillmentMethod: order.fulfillmentMethod,
        dueAt: order.dueAt,
        lines: order.lines.map((line) => ({
          sku: line.sku,
          productName: line.productName,
          quantity: line.quantity,
        })),
      }),
  );
}
