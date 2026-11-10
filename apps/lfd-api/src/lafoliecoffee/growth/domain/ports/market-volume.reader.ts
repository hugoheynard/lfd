import type { MarketVolumeView } from "@lfd/contracts";

/** Port de lecture **marché vs volume** (taille du marché + CA dans le temps). */
export abstract class MarketVolumeReader {
  abstract load(): Promise<MarketVolumeView>;
}
