/** Dupliquer un scénario sous « … (copie) » (L9-C7). Rend l'identifiant de la copie. */
export class DuplicateSimulationScenarioCommand {
  constructor(
    readonly scenarioId: string,
    readonly staffUserId: string,
  ) {}
}
