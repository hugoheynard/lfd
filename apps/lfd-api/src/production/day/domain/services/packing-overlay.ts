import { ProductionDay } from "../entities/production-day.js";
import type { ProductionOrderSnapshot } from "../entities/production-day.snapshot.js";

/** La fermeture d'un bac, telle que le colisage la rend : l'instant et la personne. */
export type SealedOrders = ReadonlyMap<string, { readonly at: Date; readonly by: string }>;

/**
 * **Les bacs fermés au colisage, posés sur le plan** (K3a, `PackedOrdersReader`)
 * — une fonction pure. Seule la fermeture : les lignes, les contenants et la
 * réserve ne sont pas lus. Ses lecteurs (l'état de la journée, le contrôle qualité) ne demandent
 * que « cette commande est-elle colisée ? ».
 */
export function overlaySeals(
  orders: readonly ProductionOrderSnapshot[],
  sealed: SealedOrders,
): readonly ProductionOrderSnapshot[] {
  return orders.map((order) => ({ ...order, packed: sealed.get(order.orderId) ?? null }));
}

/**
 * **La journée, avec ses bacs fermés** : la règle que chaque lecteur applique
 * après avoir lu la journée au dépôt et les fermetures au colisage. La
 * question va au colisage quel que soit le propriétaire de la journée : une
 * journée `legacy` n'a donc plus aucun bac fermé à ses yeux.
 *
 * 🔴 Une LECTURE : la journée rendue ne s'écrit jamais.
 */
export function withSeals(day: ProductionDay, sealed: SealedOrders): ProductionDay {
  return ProductionDay.fromSnapshot({
    ...day.toSnapshot(),
    orders: overlaySeals(day.orders, sealed),
  });
}
