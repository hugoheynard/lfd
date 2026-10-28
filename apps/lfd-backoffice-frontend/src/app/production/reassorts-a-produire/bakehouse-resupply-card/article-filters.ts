import type { ResupplyArticleView } from '@lfd/contracts';

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
 * rouvrir, où l'on a déjà saisi.
 */
export function familyOptionsOf(
  articles: readonly ResupplyArticleView[],
  quantities: ReadonlyMap<string, number>,
): readonly { value: string; label: string }[] {
  const families = new Map<string, { label: string; asked: number }>();
  for (const article of articles) {
    const family = families.get(article.categoryId) ?? { label: article.categoryName, asked: 0 };
    if ((quantities.get(article.sku) ?? 0) > 0) {
      family.asked += 1;
    }
    families.set(article.categoryId, family);
  }
  return [
    { value: ALL_FAMILIES, label: 'Tout' },
    ...[...families].map(([value, family]) => ({
      value,
      label: family.asked > 0 ? `${family.label} (${String(family.asked)})` : family.label,
    })),
  ];
}

/** Les articles de la famille retenue et de la recherche, dans l'ordre du catalogue. */
export function articlesMatching(
  articles: readonly ResupplyArticleView[],
  family: string,
  query: string,
): readonly ResupplyArticleView[] {
  const needle = normalize(query.trim());
  return articles.filter(
    (article) =>
      (family === ALL_FAMILIES || article.categoryId === family) &&
      (needle === '' || normalize(`${article.name} ${article.sku}`).includes(needle)),
  );
}
