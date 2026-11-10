import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * **Un article que le rayon des particuliers ne sert pas**, demandé dans un
 * abonnement de particulier (`plan-articles-sur-mesure.md`, § 12) : audience
 * pro, en attente de validation publique, masqué au public, réservé ou sur
 * mesure — tout ce que `servedTo(item, "public")` écarte, et un SKU inconnu.
 *
 * Un seul refus pour tous ces cas : distinguer « réservé » de « inconnu »
 * dirait à un particulier ce que son rayon lui cache.
 */
export class ArticleNotServedToPublicError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "catalog.article_not_served_to_public",
      `L'article ${sku} n'est pas proposé aux particuliers : retirez-le de l'abonnement, ou choisissez un article de la boutique.`,
    );
  }
}
