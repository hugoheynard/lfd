/**
 * Port de **purge** du cache du géocodage (`documentation/legal/rgpd-purge-du-geocodage.md`).
 * Troisième interface du cache, à côté de la lecture et de l'écriture (ISP) :
 * seul le balayage nocturne en dépend.
 */
export abstract class GeocodeCachePruner {
  /**
   * Efface au plus `limit` entrées géocodées avant cet instant ; rend combien.
   * Un compte inférieur à `limit` dit qu'il ne reste plus rien à effacer.
   */
  abstract pruneBatchBefore(instant: Date, limit: number): Promise<number>;
}
