import { catalogRootShelves } from '@lfd/b2b-ui/catalog';
import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  type CatalogItemView,
  type ProductionGroupingEntryView,
  type ProductionGroupingView,
} from '@lfd/contracts';

/**
 * Le rangement que le serveur rend en **mode boutique** pour ces SKU, à partir
 * d'un catalogue de test : rayons racine dans l'ordre du référentiel, puis
 * « Hors catalogue » (ou « Rayon inconnu » si le catalogue n'a pas été lu),
 * intertitres de sous-catégorie si le réglage les affiche.
 *
 * Il reprend `catalogRootShelves`, la règle même que les écrans appliquaient
 * avant de demander leur rangement au serveur : les suites d'avant gardent
 * leurs attentes, et prouvent que le mode boutique ne change pas l'écran.
 */
export function shelfGrouping(
  skus: readonly string[],
  catalogue: readonly CatalogItemView[] | null,
  showSubcategories = false,
): ProductionGroupingView {
  const familyOf = new Map((catalogue ?? []).map((item) => [item.sku, item.family]));
  const shelves = catalogRootShelves([...new Set(skus)], (sku) => familyOf.get(sku) ?? null);
  const entries: ProductionGroupingEntryView[] = shelves.flatMap((shelf, order) =>
    shelf.sections.flatMap((section, sectionOrder) =>
      section.items.map((sku) => ({
        sku,
        key: shelf.root?.id ?? '?',
        title:
          shelf.root?.name ?? (catalogue === null ? SHELF_LABEL_UNKNOWN : SHELF_LABEL_OFF_CATALOG),
        kind: shelf.root === null ? ('off_catalog' as const) : ('shelf' as const),
        order,
        section:
          showSubcategories && shelf.root !== null
            ? {
                key: section.family?.id ?? null,
                label: section.family?.name ?? null,
                order: sectionOrder,
              }
            : null,
      })),
    ),
  );
  return {
    mode: 'shelf',
    showSubcategories,
    shelvesKnown: catalogue !== null,
    workstationsKnown: true,
    entries,
  };
}
