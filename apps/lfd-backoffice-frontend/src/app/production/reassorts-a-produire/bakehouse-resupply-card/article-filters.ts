import type { ResupplyArticleView } from '@lfd/contracts';

import {
  filterKeyOf,
  type WorkstationFilter,
  workstationOptionsOf,
} from '../../workstation-filter';

/** La puce « Tout » : aucun filtre de famille. Hors de l'espace des identifiants. */
export const ALL_FAMILIES = '';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

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

/** Les articles de la famille (ou du poste) retenu et de la recherche, dans l'ordre du catalogue. */
export function articlesMatching(
  articles: readonly ResupplyArticleView[],
  family: string,
  query: string,
  stations: WorkstationFilter | null = null,
): readonly ResupplyArticleView[] {
  const needle = normalize(query.trim());
  return articles.filter(
    (article) =>
      (family === ALL_FAMILIES ||
        filterKeyOf(stations, article.sku, article.categoryId) === family) &&
      (needle === '' || normalize(`${article.name} ${article.sku}`).includes(needle)),
  );
}
