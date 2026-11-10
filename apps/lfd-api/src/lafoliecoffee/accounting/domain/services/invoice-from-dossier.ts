import { Invoice, type IssueInvoiceInput } from "../entities/invoice.js";
import type { InvoiceLineInput } from "../entities/invoice.types.js";
import { billedUnitPriceMillicents } from "./invoice-net-price.js";
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
 * Seul le prix net (BT-146) peut s'écarter de celui des bons, quand il ne
 * recomposerait plus le montant de la ligne (`invoice-net-price.ts`). Depuis
 * le § 18.6 du plan `plan-remise-par-ligne.md` (2026-11-01), une ligne
 * REGROUPÉE recompose toujours son montant au centime (`invoice-lines.ts`) :
 * le rattrapage ne joue plus que sur la ligne d'UN bon dont le HT ne vaut pas
 * prix × quantité — celle d'un particulier, dont le HT se déduit d'une
 * étiquette TTC arrondie. La remise de promotion n'est chiffrée que sur un
 * prix émis égal à celui des bons : brut − remise = net, sans approximation.
 * Les dates demandées des lignes du dossier ne passent PAS : la facture porte
 * les dates de livraison réelles des bons (`orders[].receivedOn`), ou rien.
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
  const unitPriceMillicents = billedUnitPriceMillicents(line);
  const discount =
    unitPriceMillicents === line.unitPriceMillicents ? line.priceDiscount : undefined;
  return {
    sku: line.sku,
    label: line.label,
    unitCode: line.unitCode,
    // Déjà en millièmes de son unité (`invoice-lines.ts`) : recopiés, revalidés par l'agrégat.
    quantityThousandths: line.quantityThousandths,
    unitPriceMillicents,
    vatRate: line.vatRate,
    amountCents: line.amountCents,
    ...(discount === undefined ? {} : { priceDiscount: discount }),
  };
}
