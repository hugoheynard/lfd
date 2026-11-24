/** Arrête un panier. Mur : son acheteur (`actorUserId`). */
export class StopBasketCommand {
  constructor(
    readonly actorUserId: string,
    readonly basketId: string,
  ) {}
}
