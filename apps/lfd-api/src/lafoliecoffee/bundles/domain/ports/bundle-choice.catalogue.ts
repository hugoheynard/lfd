import type { BundleChoiceArticle } from "./bundle-choice-article.js";

/**
 * **Que sont ces articles pour une formule ?** — ce que le contexte des
 * formules demande au catalogue du commerce, à l'enregistrement d'un choix
 * (§4.2) et pour montrer une formule composée.
 *
 * Le verdict est celui du catalogue (`servedTo(item, "public")`, la règle
 * unique du masquage, et le drapeau `operationOnly`) : une seconde lecture de
 * ces colonnes ici finirait par dire autre chose que la boutique.
 */
export abstract class BundleChoiceCatalogue {
  /** Ces articles, par SKU. Un SKU **absent** de la table est inconnu (ou retiré). */
  abstract articlesAmong(
    skus: readonly string[],
  ): Promise<ReadonlyMap<string, BundleChoiceArticle>>;
}
