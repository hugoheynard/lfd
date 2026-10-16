import type { MirroredOperation } from "../services/operation-migration.js";

/**
 * **Le miroir, tel que la boutique l'appliquait** — ce que la migration
 * compare au référentiel (lot 3) : chaque ligne de `catalog_operations`,
 * retirées comprises, avec sa surcharge de réception.
 *
 * Un port de lecture à lui (ISP) : il ne sert qu'à la migration, et il lit
 * la surcharge, que plus personne ne lit au commerce après elle.
 */
export abstract class MirroredOperationsReader {
  abstract list(): Promise<readonly MirroredOperation[]>;
}
