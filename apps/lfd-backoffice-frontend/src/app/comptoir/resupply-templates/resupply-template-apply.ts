import type {
  ResupplyArticleView,
  ResupplyTemplateApplyMode,
  ResupplyTemplateLineView,
  ResupplyTemplateView,
  SkippedResupplyTemplateLine,
} from '@lfd/contracts';

import { LINE_ISSUE_LABELS } from './resupply-template-composition';

/**
 * Les lignes d'un modèle qui s'appliquent au catalogue du réassort lu par
 * l'écran : sans défaut à la lecture de la bibliothèque, article présent, à
 * la même unité. Les autres sont écartées, avec leur raison (M6) — jamais
 * corrigées en douce.
 */
export function splitTemplateLines(
  template: ResupplyTemplateView,
  articles: readonly ResupplyArticleView[],
): {
  readonly applicable: readonly ResupplyTemplateLineView[];
  readonly skipped: readonly SkippedResupplyTemplateLine[];
} {
  const units = new Map(articles.map((article) => [article.sku, article.saleUnit] as const));
  const applicable: ResupplyTemplateLineView[] = [];
  const skipped: SkippedResupplyTemplateLine[] = [];
  for (const line of template.lines) {
    const unit = units.get(line.sku);
    const reason =
      line.issue ??
      (unit === undefined ? 'withdrawn' : unit !== line.saleUnit ? 'sale_unit_changed' : null);
    if (reason === null) {
      applicable.push(line);
    } else {
      skipped.push({ sku: line.sku, reason });
    }
  }
  return { applicable, skipped };
}

/**
 * **Remplir une composition locale depuis un modèle** (le fournil, T4) — la
 * même règle que l'application côté serveur (§ 4) : `replace` pose les
 * quantités du modèle et retire le reste, `add` les additionne à ce qui est
 * saisi. Les lignes inapplicables sont rendues à part, pour l'avis.
 */
export function filledFromTemplate(
  current: ReadonlyMap<string, number>,
  template: ResupplyTemplateView,
  mode: ResupplyTemplateApplyMode,
  articles: readonly ResupplyArticleView[],
): {
  readonly quantities: ReadonlyMap<string, number>;
  readonly skipped: readonly SkippedResupplyTemplateLine[];
} {
  const { applicable, skipped } = splitTemplateLines(template, articles);
  const quantities = new Map(mode === 'add' ? current : []);
  for (const line of applicable) {
    quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
  }
  return { quantities, skipped };
}

/**
 * L'avis des lignes écartées, qui les nomme : « 2 articles écartés :
 * Croissant (article retiré du réassort), Baguette (unité de vente changée
 * depuis). » Le nom vient du catalogue, sinon du modèle lu, sinon le SKU.
 * `null` : rien n'a été écarté.
 */
export function skippedNotice(
  skipped: readonly SkippedResupplyTemplateLine[],
  articles: readonly ResupplyArticleView[],
  template: ResupplyTemplateView | null,
): string | null {
  if (skipped.length === 0) {
    return null;
  }
  const names = new Map(articles.map((article) => [article.sku, article.name] as const));
  const named = new Map(
    (template?.lines ?? []).map((line) => [line.sku, line.articleName] as const),
  );
  const items = skipped.map((line) => {
    const name = names.get(line.sku) ?? named.get(line.sku) ?? line.sku;
    return `${name} (${LINE_ISSUE_LABELS[line.reason].toLowerCase()})`;
  });
  const head =
    skipped.length > 1 ? `${String(skipped.length)} articles écartés` : '1 article écarté';
  return `${head} : ${items.join(', ')}.`;
}
