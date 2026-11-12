import type { CatalogScreenItemView, PublishedCatalogView } from "@lfd/contracts";

/** La clé opaque de l'écran Catalogue dans l'objet — le nom de son sujet. */
export const CATALOG_SCREEN_CONTENT_KEY = "catalog-admin";

/**
 * **Ce que l'objet garde de l'écran Catalogue** (`plan-catalogue-du-back-office.md`,
 * § 3.5) : la part commune à tout porteur de `lfc_catalog`. Ni le numéro (il
 * est la clé), ni les marqueurs du sur mesure — lus à chaque appel, sous leur
 * droit, jamais rangés.
 */
export interface CatalogScreenContent {
  readonly published: PublishedCatalogView;
  readonly items: readonly CatalogScreenItemView[];
}

/**
 * Reconnaît une charge relue de l'objet. Contrôle de FORME seulement : la
 * charge a été rangée par la même révision du code (la révision est dans la
 * clé), donc par {@link CatalogScreenContent} lui-même ; une forme
 * inattendue est relue en base plutôt que servie.
 */
export function isCatalogScreenContent(raw: unknown): raw is CatalogScreenContent {
  if (typeof raw !== "object" || raw === null) {
    return false;
  }
  const published: unknown = Reflect.get(raw, "published");
  const items: unknown = Reflect.get(raw, "items");
  return (
    Array.isArray(items) &&
    typeof published === "object" &&
    published !== null &&
    Array.isArray(Reflect.get(published, "shelves")) &&
    Array.isArray(Reflect.get(published, "entries")) &&
    Array.isArray(Reflect.get(published, "pendingReview"))
  );
}
