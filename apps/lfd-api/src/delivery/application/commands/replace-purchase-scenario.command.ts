import type { SavePurchaseScenarioPayload } from "@lfd/contracts";

/** Remplacer le nom et le contenu d'un scénario d'achat (B-D5). */
export class ReplacePurchaseScenarioCommand {
  constructor(
    readonly scenarioId: string,
    readonly payload: SavePurchaseScenarioPayload,
    readonly staffUserId: string,
  ) {}
}
