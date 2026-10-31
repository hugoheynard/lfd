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

/** Tous les noms connus d'une portée, toutes cibles confondues — pour le résumé. */
export function choiceNames(choices: CatalogueChoices): ReadonlyMap<string, string> {
  return new Map(
    Object.values(choices).flatMap((groups) =>
      groups.flatMap((group) =>
        group.options.map((option) => [option.value, option.label] as const),
      ),
    ),
  );
}

/**
 * Les choix, augmentés des cibles que la promotion porte et que le catalogue
 * ne propose plus (retirées, archivées, ou catalogue illisible) : sans elles,
 * une liste montrerait « Aucune » sur une exception bien réelle.
 */
export function withRuleTargets(
  choices: CatalogueChoices,
  rules: readonly {
    readonly target: PromotionScopeTargetValue;
    readonly targetId: string;
    readonly name: string | null;
  }[],
): CatalogueChoices {
  const known = choiceNames(choices);
  const extra = (target: PromotionScopeTargetValue): ChoiceGroup[] => {
    const options = rules
      .filter((rule) => rule.target === target && !known.has(rule.targetId))
      .map((rule) => ({ value: rule.targetId, label: rule.name ?? rule.targetId }));
    return options.length === 0 ? [] : [{ label: 'Hors du catalogue publié', options }];
  };
  return {
    category: [...choices.category, ...extra('category')],
    product: [...choices.product, ...extra('product')],
    variant: [...choices.variant, ...extra('variant')],
  };
}

/**
 * **Un article du catalogue publié, rattaché à sa famille** — ce que la carte
 * « Sur quels articles ? » compte et range par famille. `familyId` est la
 * famille DIRECTE de la fiche : la vue publiée ne sert pas le chemin des
 * familles parentes (vérifié le 2026-10-31, `PublishedEntryView.categoryId`).
 */
export interface ScopeArticle {
  readonly sku: string;
  readonly productId: string;
  readonly familyId: string;
}

/** Les articles proposables — mêmes filtres que {@link catalogueChoicesOf}. */
export function scopeArticlesOf(view: PublishedCatalogView): ScopeArticle[] {
  const families = new Set(
    view.shelves.filter((shelf) => !shelf.withdrawn).map((shelf) => shelf.categoryId),
  );
  return view.entries
    .filter((entry) => families.has(entry.categoryId) && entry.status !== 'archived')
    .flatMap((entry) =>
      entry.variants.map((variant) => ({
        sku: variant.sku,
        productId: entry.productId,
        familyId: entry.categoryId,
      })),
    );
}
