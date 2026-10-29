/**
 * **Les refus d'une décision tarifaire qui vise un article hors vente**
 * (`plan-pro-voit-les-declinaisons.md`, L5, 2026-10-29).
 *
 * Avant eux, une faute de frappe sur un SKU posait une mercuriale, un
 * engagement ou une règle qui ne s'appliquait JAMAIS — sans un mot. Le
 * commercial croyait avoir tarifé un client ; la caisse ne trouvait rien.
 *
 * `BusinessError` (409) et non `DomainError` : la référence est bien formée,
 * c'est l'état du catalogue qui la refuse — elle pourrait être juste demain.
 */

import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/** « « A » » ou « « A », « B » » — les références nommées telles que saisies. */
function quoted(skus: readonly string[]): string {
  return skus.map((sku) => `« ${sku} »`).join(", ");
}

/** La référence n'est vendue sous ce SKU à personne, ni pro ni particulier. */
export class SaleReferenceNotOnSaleError extends BusinessError {
  constructor(readonly skus: readonly string[]) {
    super(
      "pricing.sale_reference.not_on_sale",
      skus.length === 1
        ? `La référence ${quoted(skus)} n'est pas en vente : vérifiez-la dans le catalogue, ou choisissez l'article dans la liste.`
        : `Les références ${quoted(skus)} ne sont pas en vente : vérifiez-les dans le catalogue, ou choisissez les articles dans la liste.`,
    );
  }
}

/** La référence désigne un article (ou une déclinaison) retiré du catalogue. */
export class SaleReferenceWithdrawnError extends BusinessError {
  constructor(readonly skus: readonly string[]) {
    super(
      "pricing.sale_reference.withdrawn",
      skus.length === 1
        ? `L'article ${quoted(skus)} a été retiré du catalogue : une décision posée dessus ne s'appliquerait jamais. Retirez-le de la saisie, ou choisissez un article en vente dans la liste.`
        : `Les articles ${quoted(skus)} ont été retirés du catalogue : une décision posée dessus ne s'appliquerait jamais. Retirez-les de la saisie, ou choisissez des articles en vente dans la liste.`,
    );
  }
}

/**
 * La référence se vend, mais pas aux professionnels — et la décision est pro
 * (mercuriale, engagement, modèle de prix, règle ou barème d'audience société,
 * plancher pro). Hugo, 2026-10-29 : une décision pro sur un article public
 * seul ne s'appliquerait jamais.
 */
export class SaleReferenceNotSoldToProsError extends BusinessError {
  constructor(readonly skus: readonly string[]) {
    super(
      "pricing.sale_reference.not_sold_to_pros",
      skus.length === 1
        ? `L'article ${quoted(skus)} n'est pas en vente aux professionnels : une décision pro posée dessus ne s'appliquerait jamais. Ouvrez-le aux pros (prix pro, audience, validation pro), ou choisissez un autre article.`
        : `Les articles ${quoted(skus)} ne sont pas en vente aux professionnels : une décision pro posée dessus ne s'appliquerait jamais. Ouvrez-les aux pros (prix pro, audience, validation pro), ou choisissez d'autres articles.`,
    );
  }
}

/**
 * Le pendant pour un plancher posé sur la clientèle des particuliers : la
 * référence ne se vend qu'aux pros.
 */
export class SaleReferenceNotSoldToPublicError extends BusinessError {
  constructor(readonly skus: readonly string[]) {
    super(
      "pricing.sale_reference.not_sold_to_public",
      skus.length === 1
        ? `L'article ${quoted(skus)} n'est pas en vente aux particuliers : une décision posée dessus pour les particuliers ne s'appliquerait jamais. Ouvrez-le à la boutique, ou choisissez un autre article.`
        : `Les articles ${quoted(skus)} ne sont pas en vente aux particuliers : une décision posée dessus pour les particuliers ne s'appliquerait jamais. Ouvrez-les à la boutique, ou choisissez d'autres articles.`,
    );
  }
}
