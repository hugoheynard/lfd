import type { SaleUnit } from "@lfd/money";

import { TechnicalError } from "../../platform/shared/errors/app-error.js";

/**
 * Une unité stockée au colisage que ce code ne connaît pas — les CHECK
 * `*_sale_unit_check` l'interdisent ; si elle arrive quand même, la colonne a
 * été élargie sans que le lecteur suive.
 */
export class StoredPackingSaleUnitUnknownError extends TechnicalError {
  constructor(sku: string, value: string) {
    super(
      "packing.sale_unit_unknown",
      `Une ligne du colisage de l'article ${sku} porte une unité inconnue (« ${value} »). ` +
        "Seules « piece » et « weight » existent : la base a été modifiée hors du code — " +
        "ne pas fermer ce bac, et prévenir l'équipe technique.",
    );
  }
}

/**
 * Lit `sale_unit` (`packing.packing_line`) dans le
 * vocabulaire du domaine. Refuse plutôt que de replier sur `piece` : des
 * grammes relus en pièces se coliseraient un par un.
 *
 * @throws {StoredPackingSaleUnitUnknownError} valeur hors de la contrainte.
 */
export function packingSaleUnitOf(sku: string, value: string): SaleUnit {
  if (value === "piece" || value === "weight") {
    return value;
  }
  throw new StoredPackingSaleUnitUnknownError(sku, value);
}
