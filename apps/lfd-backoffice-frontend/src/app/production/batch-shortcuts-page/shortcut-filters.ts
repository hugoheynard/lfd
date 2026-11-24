import { type ProductSearchKeys } from '@lfd/b2b-ui/search';
import type { BatchShortcutArticleView } from '@lfd/contracts';

/** La puce « Tout » : aucun filtre de famille. Hors de l'espace des identifiants. */
export const ALL_FAMILIES = '';

/** Un article des raccourcis pour la recherche de produits : nom, SKU, famille. */
export const SHORTCUT_ARTICLE_SEARCH: ProductSearchKeys<BatchShortcutArticleView> = {
  nameOf: (article) => article.name,
  skuOf: (article) => article.sku,
  extraOf: (article) => article.familyName,
};

/**
 * « Tout », puis une puce par famille dans l'ordre du catalogue — comme la
 * table du réassort. Une famille qui a déjà des raccourcis le dit.
 */
export function familyOptionsOf(
  articles: readonly BatchShortcutArticleView[],
  skusWithShortcuts: ReadonlySet<string>,
): readonly { value: string; label: string }[] {
  const families = new Map<string, { label: string; set: number }>();
  for (const article of articles) {
    const family = families.get(article.familyId) ?? { label: article.familyName, set: 0 };
    if (skusWithShortcuts.has(article.sku)) {
      family.set += 1;
    }
    families.set(article.familyId, family);
  }
  return [
    { value: ALL_FAMILIES, label: 'Tout' },
    ...[...families].map(([value, family]) => ({
      value,
      label: family.set > 0 ? `${family.label} (${String(family.set)})` : family.label,
    })),
  ];
}

/** Les articles de la famille retenue, dans l'ordre du catalogue. */
export function articlesOfFamily(
  articles: readonly BatchShortcutArticleView[],
  family: string,
): readonly BatchShortcutArticleView[] {
  return family === ALL_FAMILIES
    ? articles
    : articles.filter((article) => article.familyId === family);
}
