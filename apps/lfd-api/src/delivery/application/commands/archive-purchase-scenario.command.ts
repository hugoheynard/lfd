/** Archiver un scénario d'achat : il sort de la liste, son nom se libère (B-D5). */
export class ArchivePurchaseScenarioCommand {
  constructor(
    readonly scenarioId: string,
    readonly staffUserId: string,
  ) {}
}
