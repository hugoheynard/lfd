import type { Prisma } from "../../../platform/database/client/client.js";
import { REVENUE_ORDER_STATUSES, REVENUE_PAYMENT_STATUSES } from "../domain/revenue-scope.js";

/**
 * **Le `where` du chiffre d'affaires**, écrit UNE fois : le statut ET le
 * règlement. Les quatre lecteurs de CA (métriques de commandes, secteurs,
 * portefeuille, volume de marché) l'épandent ; la règle est dans
 * `revenue-scope.ts`, ce fichier n'en porte que la traduction Prisma.
 */
export function revenueWhere(): Prisma.OrderWhereInput {
  return {
    status: { in: [...REVENUE_ORDER_STATUSES] },
    paymentStatus: { in: [...REVENUE_PAYMENT_STATUSES] },
  };
}
