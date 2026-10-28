import type { SaleUnit } from "@lfd/money";

import { InternalTransferCorruptedError } from "../domain/errors/internal-transfer-errors.js";

/**
 * Lit `sale_unit` (`delivery.delivery_internal_transfer_manifest_line`) dans le
 * vocabulaire du domaine. Un manifeste figé avant la colonne porte le défaut
 * `piece`, ce qu'il était. Refuse plutôt que de replier sur `piece` : des
 * grammes relus en pièces annonceraient au site 1 250 pièces de saumon.
 *
 * @throws {InternalTransferCorruptedError} valeur hors de la contrainte CHECK.
 */
export function manifestSaleUnitOf(transferId: string, sku: string, value: string): SaleUnit {
  if (value === "piece" || value === "weight") {
    return value;
  }
  throw new InternalTransferCorruptedError(
    transferId,
    `la ligne de manifeste ${sku} porte une unité inconnue (« ${value} »)`,
  );
}
