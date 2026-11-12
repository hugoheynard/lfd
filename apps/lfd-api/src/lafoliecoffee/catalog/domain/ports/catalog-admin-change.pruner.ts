/**
 * Combien de temps une trace du journal de l'écran Catalogue reste utile :
 * sept jours, la durée des autres journaux de version.
 */
export const CATALOG_ADMIN_CHANGE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * **Balayer le journal de l'écran Catalogue** (`public.catalog_admin_change`)
 * — le seul geste de code qui y écrive : ses lignes naissent des déclencheurs.
 */
export abstract class CatalogAdminChangePruner {
  /** Retire les traces écrites avant cet instant ; rend combien. */
  abstract pruneBefore(instant: Date): Promise<number>;
}
