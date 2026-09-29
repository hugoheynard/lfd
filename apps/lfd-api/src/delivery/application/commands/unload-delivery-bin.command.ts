/** Décharger un bac d'une tournée encore au dépôt. */
export class UnloadDeliveryBinCommand {
  constructor(
    readonly roundId: string,
    readonly binId: string,
  ) {}
}
