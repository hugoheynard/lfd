/**
 * Query : la commande s'annule-t-elle pour CE client (plan, C6.8) — lue par
 * `GET /orders/:id` à côté de la commande. `userId` vient du `Principal`.
 */
export class GetOrderCancellabilityQuery {
  constructor(
    readonly userId: string,
    readonly orderId: string,
  ) {}
}
