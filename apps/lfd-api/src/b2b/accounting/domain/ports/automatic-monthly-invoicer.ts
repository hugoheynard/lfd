import type { MonthlyInvoiceReport } from "../services/monthly-invoice-report.js";

/**
 * **La facture du mois, émise par l'automatisme** (E4) : la MÊME commande
 * que le bouton, sous l'acteur système. Un port, comme
 * `AutomaticCollectionConstituter` : le passage se teste sans Nest.
 */
export abstract class AutomaticMonthlyInvoicer {
  /** @throws ce que la facture du mois refuse ; le passage le range. */
  abstract issue(legalEntityId: string, month: string): Promise<MonthlyInvoiceReport>;
}
