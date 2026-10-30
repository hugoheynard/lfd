import type { PromotionScopeTargetValue, PublishedCatalogView } from '@lfd/contracts';

/** Une liste de choix, par groupe — la forme de `fold-multiselect`. */
export interface ChoiceGroup {
  readonly label: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

/** Les cibles d'une portée, prises au catalogue publié. */
export type CatalogueChoices = Readonly<Record<PromotionScopeTargetValue, readonly ChoiceGroup[]>>;

/**
 * **Ce qu'une portée peut viser** — familles, produits (`productId`, toutes
 * leurs déclinaisons) et déclinaisons (le SKU), rangés par famille. Les
 * familles retirées et les fiches archivées ne se proposent plus.
 */
export function catalogueChoicesOf(view: PublishedCatalogView): CatalogueChoices {
  const families = view.shelves
    .filter((shelf) => !shelf.withdrawn)
    .map((shelf) => ({ id: shelf.categoryId, label: shelf.name ?? shelf.categoryId }));
  const entriesOf = (familyId: string) =>
    view.entries.filter((entry) => entry.categoryId === familyId && entry.status !== 'archived');
  const grouped = (
    pick: (entries: ReturnType<typeof entriesOf>) => ChoiceGroup['options'],
  ): ChoiceGroup[] =>
    families
      .map((family) => ({ label: family.label, options: pick(entriesOf(family.id)) }))
      .filter((group) => group.options.length > 0);
  return {
    category: [
      { label: 'Familles', options: families.map((f) => ({ value: f.id, label: f.label })) },
    ],
    product: grouped((entries) =>
      entries.map((entry) => ({ value: entry.productId, label: entry.name })),
    ),
    variant: grouped((entries) =>
      entries.flatMap((entry) =>
        entry.variants.map((variant) => ({
          value: variant.sku,
          label: `${variant.name ?? entry.name} · ${variant.sku}`,
        })),
      ),
    ),
  };
}
