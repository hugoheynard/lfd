/** Décharger un sac d'une tournée encore au dépôt. */
export class UnloadDeliveryBagCommand {
  constructor(
    readonly roundId: string,
    readonly bagId: string,
  ) {}
}
