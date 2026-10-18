import type { FulfillmentTarget } from "../../domain/orderable-today.js";

/**
 * **« Vos habituels »** (R1) : ce que la société du lecteur commande
 * régulièrement, filtré par ce qui se commande, borné à ses places.
 */
export class ListMyUsualsQuery {
  constructor(
    /** La société de l'espace courant, résolue en base ; `null` = particulier ou espace perso : rien. */
    readonly companyId: string | null,
    /** Les SKU au panier : jamais suggérés. */
    readonly skus: readonly string[],
    /** Le jour visé, si la boutique le connaît. */
    readonly target: FulfillmentTarget | null,
  ) {}
}
