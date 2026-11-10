/**
 * **Le complément à payer, relu** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.4) — la
 * reprise au rechargement de l'écran de modification. Le mur est celui de la
 * page de règlement (`ensureOrderVisible`) : qui peut voir la commande peut
 * payer son complément. Hors mur, `404`.
 */
export class GetComplementPaymentQuery {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
