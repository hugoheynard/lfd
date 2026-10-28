import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { CatalogSaleUnit } from "../domain/entities/catalog-item.js";

/**
 * Une unité de vente stockée que ce code ne connaît pas — la contrainte
 * `catalog_items_sale_unit_check` l'interdit ; si elle arrive quand même, la
 * colonne a été élargie sans que le lecteur suive.
 */
export class StoredSaleUnitUnknownError extends TechnicalError {
  constructor(sku: string, value: string) {
    super(
      "catalog_items.sale_unit_unknown",
      `L'article ${sku} porte une unité de vente inconnue (« ${value} ») dans le miroir du ` +
        "catalogue. Seules « piece » et « weight » existent : la base a été modifiée hors du " +
        "code — réémettre la fiche depuis le référentiel, et prévenir l'équipe technique.",
    );
  }
}

/**
 * Lit la colonne `sale_unit` (un `TEXT` contraint) dans le vocabulaire du
 * domaine. Refuse plutôt que de replier sur `piece` : un article au poids lu
 * à la pièce se facturerait mille fois trop cher ou trop peu.
 *
 * @throws {StoredSaleUnitUnknownError} valeur hors de la contrainte.
 */
export function saleUnitOf(sku: string, value: string): CatalogSaleUnit {
  if (value === "piece" || value === "weight") {
    return value;
  }
  throw new StoredSaleUnitUnknownError(sku, value);
}
