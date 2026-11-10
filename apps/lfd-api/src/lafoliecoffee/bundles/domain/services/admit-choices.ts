import {
  BundleChoiceNotServedToPublicError,
  BundleChoiceOperationOnlyError,
  UnknownBundleChoicesError,
} from "../errors/bundle-errors.js";
import type { BundleChoiceArticle } from "../ports/bundle-choice-article.js";

/**
 * **Ces articles peuvent-ils entrer dans une formule ?** (§4.2) — le verdict
 * du catalogue, traduit en refus nommés. Pur : la lecture est faite avant.
 *
 * Un refus nomme TOUS les articles de son cas, et le premier cas trouvé
 * gagne, dans cet ordre : inconnu, pas servi au public, réservé aux
 * opérations — du plus grossier au plus fin.
 *
 * @throws {UnknownBundleChoicesError} un SKU que le catalogue ne connaît pas.
 * @throws {BundleChoiceNotServedToPublicError} un article pas servi au public.
 * @throws {BundleChoiceOperationOnlyError} un article réservé aux opérations.
 */
export function admitChoices(
  skus: readonly string[],
  articles: ReadonlyMap<string, BundleChoiceArticle>,
): void {
  const unknown = skus.filter((sku) => !articles.has(sku));
  if (unknown.length > 0) {
    throw new UnknownBundleChoicesError(unknown);
  }
  const known = skus.flatMap((sku) => {
    const article = articles.get(sku);
    return article === undefined ? [] : [article];
  });
  const notServed = known.filter((article) => article.verdict === "not_served_to_public");
  if (notServed.length > 0) {
    throw new BundleChoiceNotServedToPublicError(notServed.map(named));
  }
  const operationOnly = known.filter((article) => article.verdict === "operation_only");
  if (operationOnly.length > 0) {
    throw new BundleChoiceOperationOnlyError(operationOnly.map(named));
  }
}

/** « Croissant » (VIE-001-1) — le nom d'abord, le SKU pour le retrouver. */
function named(article: BundleChoiceArticle): string {
  return `« ${article.name} » (${article.sku})`;
}
