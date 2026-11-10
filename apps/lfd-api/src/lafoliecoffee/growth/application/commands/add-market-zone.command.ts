/** Ajoute une zone ciblée (code postal) à la config marché. */
export class AddMarketZoneCommand {
  constructor(readonly codePostal: string) {}
}
