import { Invoice, type IssueInvoiceInput } from "../entities/invoice.js";
import type { InvoiceLineInput } from "../entities/invoice.types.js";
import { InvoiceQuantity } from "../value-objects/invoice-quantity.js";
import type { Invoice as ComputedInvoice, InvoiceLine } from "./invoice-dossier.types.js";

/** Tout ce que l'émission ajoute à la facture calculée — sauf les lignes et la ventilation. */
export type InvoiceFromDossierInput = Omit<IssueInvoiceInput, "lines" | "vat"> & {
  /** `simulateInvoiceDossier(bons).invoice` — calculée UNE fois, jamais recalculée ici. */
  readonly computed: ComputedInvoice;
};

/**
 * **Émet la facture d'un payeur à partir de son dossier calculé** — ce
 * qu'appellera la facture du mois (E4).
 *
 * Aucun recalcul : les lignes (D2, HT repris des bons — F6) et la ventilation
 * (`invoiceVatBreakdown`) sont reprises telles que le simulateur les a
 * rendues ; l'agrégat vérifie qu'elles se recomposent, il ne les refait pas.
 * Les dates demandées des lignes du dossier ne passent PAS : la facture porte
 * les dates de livraison réelles des bons (`orders[].deliveredOn`), ou rien.
 */
export function invoiceFromDossier(input: InvoiceFromDossierInput): Invoice {
  const { computed, ...issue } = input;
  return Invoice.issue({
    ...issue,
    lines: computed.lines.map(issuedLineOf),
    vat: computed.vat,
  });
}

function issuedLineOf(line: InvoiceLine): InvoiceLineInput {
  return {
    sku: line.sku,
    label: line.label,
    unitCode: line.unitCode,
    quantityThousandths: InvoiceQuantity.units(line.quantity, line.unitCode).thousandths,
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate,
    amountCents: line.amountCents,
  };
}
