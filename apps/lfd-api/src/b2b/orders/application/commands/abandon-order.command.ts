/**
 * Le client **quitte l'écran de règlement** sans payer : sa commande n'attend
 * plus sa carte (plan `documentation/order/plan-abandon-du-reglement.md`, D1).
 */
export class AbandonOrderCommand {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
  ) {}
}
