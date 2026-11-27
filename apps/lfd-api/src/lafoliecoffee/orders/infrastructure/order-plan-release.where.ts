import { OrderStatus, type Prisma } from "../../../platform/database/client/client.js";

/**
 * **Les commandes qu'un arrêt défait rend au client** — la condition UNIQUE
 * de la remise (`PrismaOrderPlanRelease`) et de la question « la remise
 * est-elle faite ? » (`PrismaReopenReleasePending`). Les deux lisent ce
 * `where` : ce que l'arrêt attend est exactement ce que la remise remet, et
 * une commande que la remise laisse confirmée ne fait jamais attendre.
 *
 * - `confirmedAt = closedAt` : l'arrêt écrit son PROPRE instant
 *   (`OnProductionDayClosed`), donc seules les commandes de CET arrêt.
 * - `readyAt: null` : une commande prête reste confirmée.
 * - aucun manque décidé, sur n'importe quel envoi : la re-clôture ne
 *   refabrique pas en entier une commande dont le départ est décidé (un reste
 *   n'existe qu'après la décision du rang 1).
 */
export function releasableFromPlanWhere(
  serviceDay: string,
  closedAt: Date,
): Prisma.OrderWhereInput {
  return {
    requestedDeliveryDate: new Date(`${serviceDay}T00:00:00.000Z`),
    status: OrderStatus.confirmed,
    confirmedAt: closedAt,
    readyAt: null,
    shortfallDecisions: { none: {} },
  };
}
