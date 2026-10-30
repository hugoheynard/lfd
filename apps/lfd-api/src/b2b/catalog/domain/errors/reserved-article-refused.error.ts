import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import type { CatalogReservationMark } from "../served-to-viewer.js";

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
 * Refuse le premier article verrouillé pour ce lecteur, dans l'ordre demandé.
 *
 * @throws {ReservedArticleRefusedError} un article réservé à un autre compte.
 */
export function refuseReserved(
  found: ReadonlyMap<string, { readonly reservation: CatalogReservationMark }>,
  skus: Iterable<string>,
): void {
  for (const sku of skus) {
    if (found.get(sku)?.reservation === "other") {
      throw new ReservedArticleRefusedError(sku);
    }
  }
}
