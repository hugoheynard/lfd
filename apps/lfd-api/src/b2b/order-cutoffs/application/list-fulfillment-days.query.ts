import type { ShopAudience } from "../../catalog/domain/ports/catalog.reader.js";

/**
 * Qui demande les journées — décidé par la ROUTE, jamais par un paramètre qui
 * changerait la clientèle d'un appelant reconnu (plan
 * `documentation/limites-de-commande/plan-jour-meme-sur-stock.md`, le bâti
 * des restes) :
 *
 * - `anonymous` : la boutique sans connexion, à l'audience qu'elle annonce ;
 * - `acting` : un client reconnu, sa société résolue par le guard (`null` =
 *   l'espace perso, le particulier) — la passation tire sa porte de la même
 *   société.
 */
export type FulfillmentDaysCaller =
  | { readonly kind: "anonymous"; readonly audience: ShopAudience }
  | { readonly kind: "acting"; readonly companyId: string | null };

/** Un visiteur sans connexion, à l'audience qu'il annonce. */
export function anonymousCaller(audience: ShopAudience): FulfillmentDaysCaller {
  return { kind: "anonymous", audience };
}

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
    /** Qui commande : sa clientèle décide quelles opérations et quelle porte du jour même. */
    readonly caller: FulfillmentDaysCaller = anonymousCaller("public"),
  ) {}
}
