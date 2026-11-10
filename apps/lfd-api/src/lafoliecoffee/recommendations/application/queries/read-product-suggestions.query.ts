import type { FulfillmentTarget } from "../../domain/orderable-today.js";

/**
 * **Les suggestions de la fiche d'un article** (RS2, fiche) : ce que le staff
 * a décidé de montrer sur cette fiche, filtré par ce qui se commande, borné à
 * sa place.
 */
export class ReadProductSuggestionsQuery {
  constructor(
    /** `null` = visiteur ou espace perso : lecteur particulier, tarif public. */
    readonly companyId: string | null,
    /** Le SKU de la fiche ouverte — jamais suggéré à lui-même. */
    readonly viewedSku: string,
    /** Les SKU au panier : jamais suggérés. */
    readonly skus: readonly string[],
    /** Le jour visé, si la boutique le connaît. */
    readonly target: FulfillmentTarget | null,
  ) {}
}
