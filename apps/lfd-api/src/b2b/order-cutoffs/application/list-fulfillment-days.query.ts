import type { ShopAudience } from "../../catalog/domain/ports/catalog.reader.js";

/**
 * Query : **la prochaine journée demandable**, pour chaque destination de
 * service. La réponse couvre tous les points de retrait plus le défaut de la
 * plateforme.
 *
 * Sans panier, elle est la même pour tout le monde. Avec un panier qui porte
 * un article « vendu seulement pendant une opération », elle ne propose que
 * des jours de retrait de l'opération (D6 du plan des opérations datées).
 */
export class ListFulfillmentDaysQuery {
  constructor(
    /** Les SKU produit du panier ; vide = aucun panier, aucune contrainte d'opération. */
    readonly cartSkus: readonly string[] = [],
    /** La clientèle qui commande : elle décide quelles opérations la voient. */
    readonly audience: ShopAudience = "public",
  ) {}
}
