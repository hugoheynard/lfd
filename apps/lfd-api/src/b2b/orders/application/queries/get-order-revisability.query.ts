/**
 * **La commande se modifie-t-elle, pour ce client, maintenant ?** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6) — avec sa
 * révision courante. Le mur est celui de `GET /orders/:id` : hors mur, `404`.
 */
export class GetOrderRevisabilityQuery {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
