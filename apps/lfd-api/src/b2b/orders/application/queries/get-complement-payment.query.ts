/**
 * **Le complément à payer, relu** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.5) — la
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
