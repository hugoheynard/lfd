import type { PurchaseScenarioSummaryView } from "@lfd/contracts";

import type { PurchaseScenarioStoredContent } from "../entities/purchase-scenario.js";

/** Un scénario relu pour être rouvert : son contenu peut ne plus se relire. */
export interface PurchaseScenarioRecord {
  readonly id: string;
  readonly name: string;
  readonly stored: PurchaseScenarioStoredContent;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

/** Port de **lecture** des scénarios d'achat (B-D5) — distinct du port d'écriture (ISP). */
export abstract class PurchaseScenariosReader {
  /** Par nom ; les archivés seulement si `includeArchived`. Un contenu illisible y compte zéro. */
  abstract list(includeArchived: boolean): Promise<readonly PurchaseScenarioSummaryView[]>;

  /** Un scénario, archivé ou non ; `null` s'il est inconnu. */
  abstract byId(id: string): Promise<PurchaseScenarioRecord | null>;
}
