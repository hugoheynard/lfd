import type { SaleUnit } from "@lfd/money";

import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/**
 * Une ligne de bon ou de BL porte une unité de vente que ce code ne connaît
 * pas — les contraintes `order_lines_sale_unit_check` et
 * `delivery_note_line_sale_unit_check` l'interdisent ; si elle arrive, la
 * colonne a été élargie sans que la facture suive.
 */
export class InvoiceLineSaleUnitUnknownError extends TechnicalError {
  constructor(orderReference: string, sku: string, value: string) {
    super(
      "accounting.invoice_line.sale_unit_unknown",
      `Le bon ${orderReference} porte, pour l'article ${sku}, une unité de vente inconnue ` +
        `(« ${value} ») : rien n'est facturé plutôt que de compter des grammes en pièces. ` +
        "Seules « piece » et « weight » existent ; prévenir l'équipe technique.",
    );
  }
}

/**
 * Lit `sale_unit` (un `TEXT` contraint, `NOT NULL DEFAULT 'piece'`) dans le
 * vocabulaire de `@lfd/money`. Aucun repli sur la pièce : une ligne au poids
 * lue à la pièce se facturerait mille fois trop. Les lignes d'avant la vente
 * au poids valent `piece` par le défaut de la colonne, pas par ce lecteur.
 *
 * @throws {InvoiceLineSaleUnitUnknownError} valeur hors de la contrainte.
 */
export function invoiceLineSaleUnitOf(
  orderReference: string,
  sku: string,
  value: string,
): SaleUnit {
  if (value === "piece" || value === "weight") {
    return value;
  }
  throw new InvoiceLineSaleUnitUnknownError(orderReference, sku, value);
}
