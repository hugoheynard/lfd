/**
 * **Où en est ma demande de modification ?** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)) — la plus
 * récente de cette commande. Le mur est celui de la commande : hors mur, `404`.
 */
export class GetMyOrderChangeRequestQuery {
  constructor(
    readonly orderId: string,
    readonly actorUserId: string,
  ) {}
}
