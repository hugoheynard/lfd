import type { CategorySnapshot } from "../entities/category.js";

/**
 * **Ces familles-là, archivées comprises**, en instantané — relues dans la
 * transaction ambiante. Un identifiant inconnu est omis.
 */
export abstract class CategorySnapshotsReader {
  abstract byIds(ids: readonly string[]): Promise<CategorySnapshot[]>;
}
