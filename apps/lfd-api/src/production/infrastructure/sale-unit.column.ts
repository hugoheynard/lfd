import type { SaleUnit } from "@lfd/money";

import { TechnicalError } from "../../platform/shared/errors/app-error.js";

/**
 * Une unité stockée au fournil que ce code ne connaît pas — les CHECK
 * `*_sale_unit_check` l'interdisent ; si elle arrive quand même, la colonne a
 * été élargie sans que le lecteur suive.
 */
export class StoredProductionSaleUnitUnknownError extends TechnicalError {
  constructor(sku: string, value: string) {
    super(
      "production.sale_unit_unknown",
      `Une ligne du plan de fabrication de l'article ${sku} porte une unité inconnue (« ${value} »). ` +
        "Seules « piece » et « weight » existent : la base a été modifiée hors du code — " +
        "ne pas lancer de fournée sur ce compte, et prévenir l'équipe technique.",
    );
  }
}

/**
 * Lit `sale_unit` (`production_order_line`, `production_count`) dans le
 * vocabulaire du domaine. Refuse plutôt que de replier sur `piece` : des
 * grammes relus en pièces feraient cuire mille fois trop.
 *
 * @throws {StoredProductionSaleUnitUnknownError} valeur hors de la contrainte.
 */
export function productionSaleUnitOf(sku: string, value: string): SaleUnit {
  if (value === "piece" || value === "weight") {
    return value;
  }
  throw new StoredProductionSaleUnitUnknownError(sku, value);
}
