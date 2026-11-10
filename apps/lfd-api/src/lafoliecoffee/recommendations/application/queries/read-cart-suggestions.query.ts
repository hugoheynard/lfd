import type { FulfillmentTarget } from "../../domain/orderable-today.js";

/**
 * **Les suggestions du panier** (RS2, panier) : ce que le staff a décidé de
 * montrer à ce panier, filtré par ce qui se commande, borné à sa place.
 */
export class ReadCartSuggestionsQuery {
  constructor(
    /** `null` = visiteur ou espace perso : lecteur particulier, tarif public. */
    readonly companyId: string | null,
    /** Les SKU au panier. */
    readonly skus: readonly string[],
    /** Le jour visé, si la boutique le connaît. */
    readonly target: FulfillmentTarget | null,
    /** Le total que le client lit au panier, en centimes, s'il est chiffré (RS8). */
    readonly cartTotalCents: number | null = null,
  ) {}
}
