import type { CatalogVersion } from "../entities/catalog-version.js";

/**
 * Port d'**écriture** des versions du catalogue. Une seule méthode, et c'est le
 * sujet : une version se **pose**, elle ne se modifie jamais.
 *
 * Pas de `save()`, pas de `update…()`, pas de primitive : une archive qui se
 * réécrit n'atteste plus rien, et l'absence de méthode est ce qui le garantit —
 * pas un commentaire que le prochain appelant peut ignorer.
 */
export abstract class CatalogVersionRepository {
  /** Pose une version. Échoue si son identifiant existe déjà. */
  abstract append(version: CatalogVersion): Promise<void>;
}
