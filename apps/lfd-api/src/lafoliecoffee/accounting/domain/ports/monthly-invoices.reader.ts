import type {
  MonthlyInvoiceAutopilotRunView,
  MonthlyInvoiceSignalView,
  MonthlyInvoiceView,
  MonthlyPeriodQuoteView,
} from "@lfd/contracts";

/** Ce que l'écran lit des factures d'une période. */
export interface MonthlyInvoicesRead {
  readonly floorAt: Date | null;
  readonly invoices: readonly MonthlyInvoiceView[];
  readonly signaled: readonly MonthlyInvoiceSignalView[];
  /** Les devis de période en attente de la clôture (P2 bis). */
  readonly periodQuotes: readonly MonthlyPeriodQuoteView[];
  readonly autopilotRun: MonthlyInvoiceAutopilotRunView | null;
}

/**
 * Port de LECTURE de la facture du mois pour l'écran (E4) — séparé de
 * `MonthlyInvoicingReader`, qui sert l'émission : l'écran ne lit pas les bons.
 * Rend des vues : aucun agrégat n'y est relu.
 */
export abstract class MonthlyInvoicesReader {
  abstract ofPeriod(legalEntityId: string, periodClosesAt: Date): Promise<MonthlyInvoicesRead>;
}
