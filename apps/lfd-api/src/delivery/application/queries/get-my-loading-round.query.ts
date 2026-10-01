/** Le chargement de MA tournée — l'écran de scan du livreur (PL1). */
export class GetMyLoadingRoundQuery {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
  ) {}
}
