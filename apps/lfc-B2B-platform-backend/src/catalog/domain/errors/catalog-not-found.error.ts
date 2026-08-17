import { ResourceNotFoundError } from "../../../shared/errors/app-error.js";

/**
 * L'article visé n'est pas au catalogue.
 *
 * Arrive pour de bon : un push a pu le retirer entre l'affichage de la liste et
 * le clic. Un 404 dit exactement ça — la ligne a disparu, ce qui est le
 * résultat voulu par quelqu'un d'autre.
 */
export class CatalogItemNotFoundError extends ResourceNotFoundError {
  constructor(readonly sku: string) {
    super("catalog.item.not_found", "Cet article n'est plus au catalogue.");
  }
}
