import type { SharedObjectState } from "@lfd/ops-contract";

/** Une heure d'un cache, telle que l'objet l'a comptée. */
export interface SharedCacheHour {
  readonly cache: string;
  readonly hourMs: number;
  readonly hits: number;
  readonly misses: number;
  readonly stores: number;
  readonly tooLarge: number;
  readonly bytes: number | null;
  readonly entries: number | null;
  readonly persons: number;
}

/** Le pic de requêtes par seconde d'une heure. */
export interface SharedObjectPeak {
  readonly hourMs: number;
  readonly perSecond: number;
}

/** Ce qu'un objet a rendu — ou pourquoi il n'a rien rendu. */
export interface SharedObjectReading {
  readonly object: string;
  readonly state: SharedObjectState;
  readonly hours: readonly SharedCacheHour[];
  readonly peaks: readonly SharedObjectPeak[];
}

/**
 * Port de **lecture** des compteurs horaires des objets partagés (plan de
 * l'onglet Cache, § 3). Ne lève pas : un objet injoignable se dit dans son
 * état, la page ne tombe pas avec ce qu'elle observe.
 */
export abstract class SharedCacheMetricsReader {
  abstract read(sinceMs: number): Promise<readonly SharedObjectReading[]>;
}
