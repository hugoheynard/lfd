import type { CompanyPricingCategoryView } from '@lfd/contracts';
import { decidingScopeRule } from '@lfd/contracts/promotion-scope';

import type { DiscountLineForm, GeneralDiscountForm } from './general-discount-form';
import type { DiscountArticle } from './general-discount-pricing';
import { discountLabel } from './general-discount-reading';

/**
 * **Les lignes du sélecteur de remise** : les familles qu'une ligne peut
 * viser, les noms des cibles, et les lignes saisies rangées sous la famille
 * qui les contient, chacune avec le compte des articles qu'elle décide. Pur.
 */

/** Une famille qu'une ligne peut viser, sous-familles et parentes sans article comprises. */
export interface DiscountFamily {
  readonly id: string;
  readonly name: string;
  /** Elle puis ses parentes. */
  readonly path: readonly string[];
}

/** Les familles, chacune après ses parentes, dans l'ordre du catalogue. */
export function discountFamiliesOf(
  categories: readonly CompanyPricingCategoryView[],
): readonly DiscountFamily[] {
  const seen = new Map<string, DiscountFamily>();
  for (const category of categories) {
    const path = category.family.path ?? [category.id];
    const ancestors = category.family.ancestors ?? [];
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      const ancestor = ancestors[index];
      if (ancestor !== undefined && !seen.has(ancestor.id)) {
        const at = path.indexOf(ancestor.id);
        seen.set(ancestor.id, {
          id: ancestor.id,
          name: ancestor.name,
          path: at === -1 ? [ancestor.id] : path.slice(at),
        });
      }
    }
    if (!seen.has(category.id)) {
      seen.set(category.id, { id: category.id, name: category.name, path });
    }
  }
  return [...seen.values()];
}

/** Les noms des cibles d'une remise : familles et articles. */
export function discountNames(
  categories: readonly CompanyPricingCategoryView[],
): ReadonlyMap<string, string> {
  return new Map([
    ...discountFamiliesOf(categories).map((family) => [family.id, family.name] as const),
    ...categories.flatMap((category) =>
      category.items.map((item) => [item.sku, `${item.name} (${item.sku})`] as const),
    ),
  ]);
}

/** Une ligne affichée : sa cible nommée, et ce qu'elle décide. */
export interface DiscountLineRow {
  readonly line: DiscountLineForm;
  readonly key: string;
  readonly name: string;
  readonly subtitle: string;
  /** Une sous-famille (ou un article) range sous la ligne de famille qui la contient. */
  readonly nested: boolean;
}

/** La ligne de famille la plus proche qui contient ce chemin, hors lui-même. */
function parentLine(
  path: readonly string[],
  lines: readonly DiscountLineForm[],
  self: string,
): DiscountLineForm | undefined {
  const families = new Map(
    lines.filter((line) => line.target === 'category').map((line) => [line.targetId, line]),
  );
  return path
    .filter((id) => id !== self)
    .map((id) => families.get(id))
    .find((line) => line);
}

function decisionWord(line: DiscountLineForm): string {
  if (line.excluded) {
    return 'exclue';
  }
  return line.bp === null ? 'taux à saisir' : discountLabel(line.bp);
}

/**
 * Les lignes, rangées : chaque famille suit l'ordre du catalogue, une
 * sous-famille ou un article vient sous la ligne de famille qui le contient,
 * et dit ce qu'il change à son parent (« sous-famille de Pains (−40 %) »).
 * Le compte est celui des articles que la ligne décide.
 */
export function discountLineRows(
  form: GeneralDiscountForm,
  families: readonly DiscountFamily[],
  articles: readonly DiscountArticle[],
  names: ReadonlyMap<string, string>,
): readonly DiscountLineRow[] {
  const familyOrder = new Map(families.map((family, index) => [family.id, index]));
  const pathOf = (line: DiscountLineForm): readonly string[] =>
    line.target === 'category'
      ? (families.find((family) => family.id === line.targetId)?.path ?? [line.targetId])
      : (articles.find((article) => article.sku === line.targetId)?.categoryPath ?? []);
  const rank = (line: DiscountLineForm): number =>
    familyOrder.get(line.target === 'category' ? line.targetId : (pathOf(line)[0] ?? '')) ??
    Number.MAX_SAFE_INTEGER;
  const rules = form.lines.map((line) => ({
    target: line.target,
    targetId: line.targetId,
    line,
  }));
  const decided = (line: DiscountLineForm): number =>
    articles.filter(
      (article) =>
        decidingScopeRule(rules, {
          sku: article.sku,
          productId: null,
          categoryPath: article.categoryPath,
        })?.rule.line === line,
    ).length;
  return [...form.lines]
    .sort(
      (a, b) =>
        rank(a) - rank(b) || Number(a.target === 'variant') - Number(b.target === 'variant'),
    )
    .map((line) => {
      const parent = parentLine(pathOf(line), form.lines, line.targetId);
      const kind = line.target === 'category' ? 'Famille' : 'Article';
      const head =
        parent === undefined
          ? kind
          : `${line.target === 'category' ? 'Sous-famille' : 'Article'} de ${names.get(parent.targetId) ?? parent.targetId} (${decisionWord(parent)})`;
      const count = decided(line);
      return {
        line,
        key: `${line.target}:${line.targetId}`,
        name: names.get(line.targetId) ?? line.targetId,
        subtitle: `${head} · ${String(count)} article(s)`,
        nested: parent !== undefined,
      };
    });
}
