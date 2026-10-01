import type { SavePurchaseScenarioPayload } from "@lfd/contracts";

/** Enregistrer un scénario d'achat neuf (B-D5). Rend son identifiant. */
export class RecordPurchaseScenarioCommand {
  constructor(
    readonly payload: SavePurchaseScenarioPayload,
    readonly staffUserId: string,
  ) {}
}
