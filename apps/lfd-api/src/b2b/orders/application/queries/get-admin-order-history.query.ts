/**
 * Lit l'**historique** d'une commande pour le staff : les faits du journal qui
 * la concernent (plan `documentation/order/plan-page-commandes.md`, §3 bis).
 */
export class GetAdminOrderHistoryQuery {
  constructor(readonly orderId: string) {}
}
