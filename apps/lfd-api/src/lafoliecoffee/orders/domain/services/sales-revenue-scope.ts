import {
  REVENUE_ORDER_STATUSES,
  REVENUE_PAYMENT_STATUSES,
  REVENUE_SETTLEMENT_VENUE,
} from "../../../growth/domain/revenue-scope.js";

const REVENUE_STATUSES: ReadonlySet<string> = new Set(REVENUE_ORDER_STATUSES);
const REVENUE_PAYMENTS: ReadonlySet<string> = new Set(REVENUE_PAYMENT_STATUSES);

/** Ce qu'il faut d'une commande pour juger si elle fait du CA. */
export interface RevenueScopeFacts {
  readonly status: string;
  readonly paymentStatus: string;
  readonly settlementVenue: string | null;
  readonly offered: boolean;
}

/**
 * **La commande compte-t-elle dans le chiffre d'affaires ?** — le périmètre
 * de `growth/domain/revenue-scope.ts`, importé et jamais recopié : l'export
 * des ventes et le cockpit disent le même CA, au centime. C'est la
 * traduction en mémoire de `revenueWhere` : statut porteur, règlement
 * porteur, aucun lieu de règlement ailleurs (la caisse de la boutique les
 * compte déjà), et non offerte.
 */
export function countsAsRevenue(order: RevenueScopeFacts): boolean {
  return (
    REVENUE_STATUSES.has(order.status) &&
    REVENUE_PAYMENTS.has(order.paymentStatus) &&
    order.settlementVenue === REVENUE_SETTLEMENT_VENUE &&
    !order.offered
  );
}
