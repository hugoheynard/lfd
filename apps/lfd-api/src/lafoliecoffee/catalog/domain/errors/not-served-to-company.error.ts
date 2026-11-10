import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un article que le rayon pro de ce compte ne sert pas**, demandé dans un
 * abonnement pro (`plan-articles-sur-mesure.md`, § 12, décision de Hugo du
 * 2026-10-30) : audience publique seule, en attente de validation pro, masqué
 * au rayon pro, réservé ailleurs sans être montré, ou référence inconnue.
 *
 * Un seul refus pour tous ces cas : un article réservé à un autre compte et
 * invisible ne doit pas se distinguer d'un article inexistant. Le réservé
 * MONTRÉ verrouillé garde son refus propre (`ReservedArticleRefusedError`).
 */
export class ArticleNotServedToCompanyError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "catalog.article_not_served_to_company",
      `L'article ${sku} n'est pas proposé à ce compte : retirez-le de l'abonnement, ou vérifiez au back-office son audience, son masquage et sa validation pro.`,
    );
  }
}
