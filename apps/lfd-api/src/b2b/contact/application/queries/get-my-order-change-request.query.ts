/**
 * **Où en est ma demande de modification ?** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4) — la plus
 * récente de cette commande. Le mur est celui de la commande : hors mur, `404`.
 */
export class GetMyOrderChangeRequestQuery {
  constructor(
    readonly orderId: string,
    readonly actorUserId: string,
  ) {}
}
