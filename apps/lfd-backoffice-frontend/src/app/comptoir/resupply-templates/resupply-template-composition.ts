import type {
  ResupplyArticleView,
  ResupplyTemplateLine,
  ResupplyTemplateLineIssue,
  ResupplyTemplateLineView,
  ResupplyTemplateView,
} from '@lfd/contracts';

/** Pourquoi une ligne ne s'appliquerait pas aujourd'hui, en mots du comptoir. */
export const LINE_ISSUE_LABELS: Readonly<Record<ResupplyTemplateLineIssue, string>> = {
  withdrawn: 'Article retiré du réassort',
  sale_unit_changed: 'Unité de vente changée depuis',
};

/**
 * Un modèle ouvert en composition : les quantités des lignes qui
 * s'appliquent (elles vont dans la table du catalogue), et à part les lignes
 * inapplicables, gardées telles quelles jusqu'à ce qu'on les retire.
 */
export interface TemplateComposition {
  readonly quantities: ReadonlyMap<string, number>;
  readonly stale: readonly ResupplyTemplateLineView[];
}

export function compositionOf(template: ResupplyTemplateView): TemplateComposition {
  return {
    quantities: new Map(
      template.lines
        .filter((line) => line.issue === null)
        .map((line) => [line.sku, line.quantity] as const),
    ),
    stale: template.lines.filter((line) => line.issue !== null),
  };
}

/**
 * Les lignes qui s'enregistrent : celles de la table, dans l'ordre du
 * catalogue et à l'unité qu'il dit aujourd'hui, puis les lignes inapplicables
 * qu'on n'a pas retirées. Une ligne inapplicable dont l'article a été ressaisi
 * dans la table cède à la saisie : un SKU ne figure qu'une fois.
 */
export function templateLines(
  articles: readonly ResupplyArticleView[],
  quantities: ReadonlyMap<string, number>,
  stale: readonly ResupplyTemplateLineView[],
): ResupplyTemplateLine[] {
  const fromTable = articles
    .filter((article) => (quantities.get(article.sku) ?? 0) > 0)
    .map((article) => ({
      sku: article.sku,
      quantity: quantities.get(article.sku) ?? 0,
      saleUnit: article.saleUnit,
    }));
  const taken = new Set(fromTable.map((line) => line.sku));
  const kept = stale
    .filter((line) => !taken.has(line.sku))
    .map((line) => ({ sku: line.sku, quantity: line.quantity, saleUnit: line.saleUnit }));
  return [...fromTable, ...kept];
}

/** Combien de lignes d'un modèle ne s'appliqueraient pas aujourd'hui. */
export function staleCount(template: ResupplyTemplateView): number {
  return template.lines.filter((line) => line.issue !== null).length;
}
