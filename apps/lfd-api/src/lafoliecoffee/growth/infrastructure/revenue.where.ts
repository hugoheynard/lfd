import type { Prisma } from "../../../platform/database/client/client.js";
import {
  REVENUE_ORDER_STATUSES,
  REVENUE_PAYMENT_STATUSES,
  REVENUE_SETTLEMENT_VENUE,
} from "../domain/revenue-scope.js";

/**
 * **Le `where` du chiffre d'affaires**, écrit UNE fois : le statut, le
 * règlement, et le lieu de règlement. Les quatre lecteurs de CA (métriques de commandes, secteurs,
 * portefeuille, volume de marché) l'épandent ; la règle est dans
 * `revenue-scope.ts`, ce fichier n'en porte que la traduction Prisma.
 */
export function revenueWhere(): Prisma.OrderWhereInput {
  return {
    status: { in: [...REVENUE_ORDER_STATUSES] },
    paymentStatus: { in: [...REVENUE_PAYMENT_STATUSES] },
    settlementVenue: REVENUE_SETTLEMENT_VENUE,
    // Une commande offerte n'est pas un achat : elle fausserait le nombre de
    // commandes et le panier moyen (`la-commande-offerte.md`, § 2.8).
    offerNature: null,
  };
}
