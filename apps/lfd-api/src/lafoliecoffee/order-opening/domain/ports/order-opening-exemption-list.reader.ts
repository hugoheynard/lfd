import type { OrderOpeningExemptionView } from "@lfd/contracts";

/** Port de **lecture** de l'écran : les exemptions actives, les plus récentes d'abord. */
export abstract class OrderOpeningExemptionListReader {
  abstract list(): Promise<readonly OrderOpeningExemptionView[]>;
}
