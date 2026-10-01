/** Réactiver un scénario d'achat archivé : il revient dans la liste, sous son nom (B-D5). */
export class ReactivatePurchaseScenarioCommand {
  constructor(
    readonly scenarioId: string,
    readonly staffUserId: string,
  ) {}
}
