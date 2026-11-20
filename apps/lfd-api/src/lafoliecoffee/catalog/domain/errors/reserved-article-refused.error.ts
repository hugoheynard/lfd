import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import { unorderableCause, type OrderabilityMarks, type UnorderableCause } from "../orderable.js";
import { ArticleOffMenuError } from "./article-off-menu.error.js";

/**
 * **Un article réservé à un autre compte**, demandé pour celui-ci
 * (`documentation/catalogue/plan-articles-sur-mesure.md`, S2) — distinct de
 * l'article inconnu : il existe, le client l'a vu « visible, non commandable »,
 * et la phrase doit dire pourquoi la demande échoue.
 *
 * Levée par le chemin qui facture (devis, passation, lignes nouvelles d'une
 * révision), à la création d'un abonnement et de sa dérogation, et à la pose
 * d'une ligne de mercuriale (Q1). Un article `hidden` reste, lui, un article
 * inconnu (`UnknownSkuError`) : le nommer dirait qu'il existe.
 */
export class ReservedArticleRefusedError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "catalog.reserved_article",
      `L'article ${sku} est réservé à un autre compte : retirez-le de la demande, ou réservez-le à ce compte depuis sa fiche article au back-office.`,
    );
  }
}

/**
 * Refuse le premier article non commandable pour ce lecteur, dans l'ordre
 * demandé — réservé à un autre compte, ou hors de la carte du site.
 *
 * @throws {ReservedArticleRefusedError} un article réservé à un autre compte.
 * @throws {ArticleOffMenuError} un article hors de la carte du site.
 */
export function refuseUnorderable(
  found: ReadonlyMap<string, OrderabilityMarks>,
  skus: Iterable<string>,
): void {
  for (const sku of skus) {
    const item = found.get(sku);
    const cause = item === undefined ? null : unorderableCause(item);
    if (cause !== null) {
      throw unorderableError(sku, cause);
    }
  }
}

/** Le refus qui nomme la cause. */
export function unorderableError(
  sku: string,
  cause: UnorderableCause,
): ReservedArticleRefusedError | ArticleOffMenuError {
  return cause === "reserved_elsewhere"
    ? new ReservedArticleRefusedError(sku)
    : new ArticleOffMenuError(sku);
}
