import type { SectorRevenueView } from "@lfd/contracts";

/** Port de lecture du **CA par secteur NAF dans le temps**. */
export abstract class SectorRevenueReader {
  abstract load(): Promise<SectorRevenueView>;
}
