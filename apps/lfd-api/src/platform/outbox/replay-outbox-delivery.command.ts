/** Rejouer une livraison morte : remettre ses essais à zéro (plan §8). */
export class ReplayOutboxDeliveryCommand {
  constructor(
    readonly eventId: string,
    readonly subscriber: string,
  ) {}
}
