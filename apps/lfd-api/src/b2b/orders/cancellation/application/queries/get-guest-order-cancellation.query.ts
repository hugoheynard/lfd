/** Query : la page d'annulation d'un invité (plan, C6.4) — le jeton arrive du corps. */
export class GetGuestOrderCancellationQuery {
  constructor(
    readonly orderId: string,
    readonly token: string,
  ) {}
}
