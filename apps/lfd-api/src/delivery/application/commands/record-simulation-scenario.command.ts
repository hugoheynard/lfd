import type { SaveDeliverySimulationScenarioPayload } from "@lfd/contracts";

/** Enregistrer un scénario neuf du simulateur (L9-C7). Rend son identifiant. */
export class RecordSimulationScenarioCommand {
  constructor(
    readonly payload: SaveDeliverySimulationScenarioPayload,
    readonly staffUserId: string,
  ) {}
}
