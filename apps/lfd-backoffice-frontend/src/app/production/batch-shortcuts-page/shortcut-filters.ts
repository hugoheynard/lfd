import type { BatchShortcutArticleView } from '@lfd/contracts';

/** La puce « Tout » : aucun filtre de famille. Hors de l'espace des identifiants. */
export const ALL_FAMILIES = '';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

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

/** Les articles de la famille retenue et de la recherche, dans l'ordre du catalogue. */
export function articlesMatching(
  articles: readonly BatchShortcutArticleView[],
  family: string,
  query: string,
): readonly BatchShortcutArticleView[] {
  const needle = normalize(query.trim());
  return articles.filter(
    (article) =>
      (family === ALL_FAMILIES || article.familyId === family) &&
      (needle === '' || normalize(`${article.name} ${article.sku}`).includes(needle)),
  );
}
