import type { SaveDeliverySimulationScenarioPayload } from "@lfd/contracts";

/** Remplacer le nom et le contenu d'un scénario (L9-C7). */
export class ReplaceSimulationScenarioCommand {
  constructor(
    readonly scenarioId: string,
    readonly payload: SaveDeliverySimulationScenarioPayload,
    readonly staffUserId: string,
  ) {}
}
