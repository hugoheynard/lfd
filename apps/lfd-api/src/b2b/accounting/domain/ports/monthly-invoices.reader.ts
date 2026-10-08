import type {
  MonthlyInvoiceAutopilotRunView,
  MonthlyInvoiceSignalView,
  MonthlyInvoiceView,
} from "@lfd/contracts";

/** Ce que l'écran lit d'un mois de factures. */
export interface MonthlyInvoicesRead {
  readonly floorAt: Date | null;
  readonly invoices: readonly MonthlyInvoiceView[];
  readonly signaled: readonly MonthlyInvoiceSignalView[];
  readonly autopilotRun: MonthlyInvoiceAutopilotRunView | null;
}

/**
 * Port de LECTURE de la facture du mois pour l'écran (E4) — séparé de
 * `MonthlyInvoicingReader`, qui sert l'émission : l'écran ne lit pas les bons.
 * Rend des vues : aucun agrégat n'y est relu.
 */
export abstract class MonthlyInvoicesReader {
  abstract ofMonth(legalEntityId: string, month: string): Promise<MonthlyInvoicesRead>;
}
