import type { DeliverySimulationScenarioSummaryView } from "@lfd/contracts";

import type { SimulationScenarioContent } from "../entities/simulation-scenario.js";

/** Un scénario vivant relu pour être rouvert : son contenu peut ne plus se relire. */
export interface SimulationScenarioRecord {
  readonly id: string;
  readonly name: string;
  readonly content: SimulationScenarioContent;
  readonly updatedAt: Date;
}

/** Port de **lecture** des scénarios du simulateur (L9-C7). */
export abstract class SimulationScenarioReader {
  /** Les scénarios non archivés, triés par nom. Un contenu illisible y compte zéro arrêt. */
  abstract list(): Promise<readonly DeliverySimulationScenarioSummaryView[]>;

  /** Un scénario NON archivé ; `null` s'il est inconnu ou archivé. */
  abstract byId(id: string): Promise<SimulationScenarioRecord | null>;
}
