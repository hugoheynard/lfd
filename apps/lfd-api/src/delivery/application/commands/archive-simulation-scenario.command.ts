/** Archiver un scénario : il sort de la liste, son nom se libère (L9-C7). */
export class ArchiveSimulationScenarioCommand {
  constructor(
    readonly scenarioId: string,
    readonly staffUserId: string,
  ) {}
}
