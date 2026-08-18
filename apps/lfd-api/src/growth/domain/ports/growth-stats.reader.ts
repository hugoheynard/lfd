import type { GrowthStatsView } from "@lfd/contracts";

/**
 * Port de lecture des **stats de croissance** (dashboard analytique). L'adaptateur
 * lit le journal + les leads — jamais les tables voisines — et délègue le calcul à
 * la fonction pure `deriveGrowthStats`.
 */
export abstract class GrowthStatsReader {
  abstract load(): Promise<GrowthStatsView>;
}
