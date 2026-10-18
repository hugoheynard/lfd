import type { FulfillmentTarget } from "../../domain/orderable-today.js";

/**
 * **Les suggestions de l'accueil** (RS7) : ce que le staff a décidé de montrer
 * partout, filtré par ce qui se commande, borné à ses places.
 */
export class ReadHomeSuggestionsQuery {
  constructor(
    /** `null` = visiteur ou espace perso : lecteur particulier, tarif public. */
    readonly companyId: string | null,
    /** Les SKU au panier : jamais suggérés. */
    readonly skus: readonly string[],
    /** Le jour visé, si la boutique le connaît. */
    readonly target: FulfillmentTarget | null,
  ) {}
}
