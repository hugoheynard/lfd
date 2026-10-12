/**
 * **La facture a-t-elle tenté cette clôture ?** — lu par le réglage du rythme
 * (plan `plan-rythme-de-facturation.md`, §12) : un changement programmé reste
 * en attente tant que sa clôture de prise d'effet n'a pas été tentée.
 *
 * Un port à part de `InvoiceAutopilotRuns` (ISP) : le réglage ne prend ni
 * ne tranche aucune tentative, il la constate. Même table
 * (`invoice_autopilot_run`), même clé (entité, `period_closes_at`).
 */
export abstract class InvoicedClosuresReader {
  abstract attempted(legalEntityId: string, periodClosesAt: Date): Promise<boolean>;
}
