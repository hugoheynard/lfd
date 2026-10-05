import type { ProductionOrderSnapshot } from "../entities/production-day.snapshot.js";

/**
 * **Les bacs fermés au colisage, posés sur le plan** (K3a, `PackedOrdersReader`)
 * — une fonction pure. Seule la fermeture : les lignes, les contenants et la
 * réserve ne sont pas lus. Ses lecteurs (l'état de la journée, le contrôle qualité) ne demandent
 * que « cette commande est-elle colisée ? ».
 */
export function overlaySeals(
  orders: readonly ProductionOrderSnapshot[],
  sealed: ReadonlyMap<string, { readonly at: Date; readonly by: string }>,
): readonly ProductionOrderSnapshot[] {
  return orders.map((order) => ({ ...order, packed: sealed.get(order.orderId) ?? null }));
}
