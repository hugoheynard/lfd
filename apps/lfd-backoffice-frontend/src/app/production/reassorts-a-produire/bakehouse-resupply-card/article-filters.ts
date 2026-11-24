import { type ProductSearchKeys } from '@lfd/b2b-ui/search';
import type { ResupplyArticleView } from '@lfd/contracts';

import {
  filterKeyOf,
  type WorkstationFilter,
  workstationOptionsOf,
} from '../../workstation-filter';

/** La puce « Tout » : aucun filtre de famille. Hors de l'espace des identifiants. */
export const ALL_FAMILIES = '';

/** Un article du réassort pour la recherche de produits : son nom, son SKU, et sa famille. */
export const RESUPPLY_ARTICLE_SEARCH: ProductSearchKeys<ResupplyArticleView> = {
  nameOf: (article) => article.name,
  skuOf: (article) => article.sku,
  extraOf: (article) => article.categoryName,
};

/**
 * « Tout », puis une puce par famille dans l'ordre du catalogue (Hugo,
 * 2026-10-28). Une famille qui a déjà des quantités le dit : on voit, sans la
 * rouvrir, où l'on a déjà saisi. En mode prod (`stations`), une puce par
 * poste, dans l'ordre des fiches (plan des postes, § 3.7).
 */
export function familyOptionsOf(
  articles: readonly ResupplyArticleView[],
  quantities: ReadonlyMap<string, number>,
  stations: WorkstationFilter | null = null,
): readonly { value: string; label: string }[] {
  const families = new Map<string, { label: string; asked: number }>();
  if (stations !== null) {
    for (const option of workstationOptionsOf(
      stations,
      articles.map((article) => article.sku),
    )) {
      families.set(option.value, { label: option.label, asked: 0 });
    }
  }
  for (const article of articles) {
    const key = filterKeyOf(stations, article.sku, article.categoryId);
    if (key === null) {
      continue;
    }
    const family = families.get(key) ?? { label: article.categoryName, asked: 0 };
    if ((quantities.get(article.sku) ?? 0) > 0) {
      family.asked += 1;
    }
    families.set(key, family);
  }
  return [
    { value: ALL_FAMILIES, label: 'Tout' },
    ...[...families].map(([value, family]) => ({
      value,
      label: family.asked > 0 ? `${family.label} (${String(family.asked)})` : family.label,
    })),
  ];
}

/** Les articles de la famille (ou du poste) retenu, dans l'ordre du catalogue. */
export function articlesOfFamily(
  articles: readonly ResupplyArticleView[],
  family: string,
  stations: WorkstationFilter | null = null,
): readonly ResupplyArticleView[] {
  return family === ALL_FAMILIES
    ? articles
    : articles.filter(
        (article) => filterKeyOf(stations, article.sku, article.categoryId) === family,
      );
}
