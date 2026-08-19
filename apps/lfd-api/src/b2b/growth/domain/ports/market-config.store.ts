import type { MarketConfigView, MarketZoneCount } from "@lfd/contracts";

/**
 * Port **MarketConfigStore** — persistance de la config marché (zones ciblées + NAF
 * ciblés) et des comptages stockés. `saveZoneCounts` fige le dénominateur d'une zone
 * après interrogation de l'annuaire.
 */
export abstract class MarketConfigStore {
  abstract load(): Promise<MarketConfigView>;
  abstract addZone(codePostal: string): Promise<void>;
  abstract removeZone(codePostal: string): Promise<void>;
  abstract addNaf(code: string, label: string): Promise<void>;
  abstract removeNaf(code: string): Promise<void>;
  abstract saveZoneCounts(
    codePostal: string,
    perNaf: readonly MarketZoneCount[],
    addressable: number,
    fetchedAt: Date,
  ): Promise<void>;
}
