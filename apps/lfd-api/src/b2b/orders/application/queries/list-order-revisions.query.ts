/**
 * Lit les **versions précédentes** d'une commande pour l'équipe (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §6, M3) : chaque
 * modification, et la composition qu'elle a remplacée.
 */
export class ListOrderRevisionsQuery {
  constructor(readonly orderId: string) {}
}
