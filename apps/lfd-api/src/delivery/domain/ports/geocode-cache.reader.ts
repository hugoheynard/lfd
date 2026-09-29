import type { GeoPoint } from "../value-objects/geo-point.js";

/**
 * Port de **lecture** du cache du géocodage (L7-C10) : par clé d'adresse
 * normalisée, les points géocodés depuis `freshSince` — une entrée plus vieille
 * n'est plus crue.
 */
export abstract class GeocodeCacheReader {
  abstract find(keys: readonly string[], freshSince: Date): Promise<ReadonlyMap<string, GeoPoint>>;
}
