/** Retire une zone ciblée de la config marché. */
export class RemoveMarketZoneCommand {
  constructor(readonly codePostal: string) {}
}
