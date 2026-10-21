import type { PlacedSiteResupplySnapshot, SiteResupplySnapshot } from "./site-resupply.js";

/**
 * Port de **lecture** des réassorts — distinct du port d'écriture (ISP) :
 * les écrans les listent, ils ne les mutent pas.
 */
export abstract class SiteResupplyReader {
  /**
   * Les réassorts d'un point pour ces journées, demandes en cours (brouillons)
   * et annulés compris, les plus récents d'abord.
   */
  abstract forSite(
    siteId: string,
    serviceDays: readonly string[],
  ): Promise<readonly SiteResupplySnapshot[]>;

  /** Les réassorts PASSÉS (ni brouillons, ni annulés) de tous les points pour ces journées, dans l'ordre de passation. */
  abstract placedOn(serviceDays: readonly string[]): Promise<readonly PlacedSiteResupplySnapshot[]>;
}
