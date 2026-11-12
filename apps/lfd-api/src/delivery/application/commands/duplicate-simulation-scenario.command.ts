/**
 * Dupliquer un scénario sous « … (copie) » (L9-C7). Rend l'identifiant de la copie.
 * `intentKey` : la clé que l'écran a fabriquée pour ce geste — un double clic
 * ne fait qu'une copie.
 */
export class DuplicateSimulationScenarioCommand {
  constructor(
    readonly scenarioId: string,
    readonly staffUserId: string,
    readonly intentKey: string,
  ) {}
}
