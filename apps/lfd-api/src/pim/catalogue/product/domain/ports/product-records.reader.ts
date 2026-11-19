import type { ProductRecord } from "./product.repository.js";

/**
 * **Ces fiches-là, archivées comprises**, en instantané — relues dans la
 * transaction ambiante, pour qu'un émetteur lise ce que son geste vient
 * d'écrire. Un identifiant inconnu est omis.
 */
export abstract class ProductRecordsReader {
  abstract byIds(ids: readonly string[]): Promise<ProductRecord[]>;
}
