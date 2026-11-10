import type { MarketSectorsView } from "@lfd/contracts";

/** Port de lecture du **mix des clients par secteur NAF et territoire**. */
export abstract class MarketSectorsReader {
  abstract load(): Promise<MarketSectorsView>;
}
