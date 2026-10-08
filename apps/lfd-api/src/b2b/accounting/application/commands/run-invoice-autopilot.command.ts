import type { SettledInvoiceAutopilotOutcome } from "../../domain/ports/invoice-autopilot-runs.js";

/** Une tentative faite par CE passage. */
export interface InvoiceAutopilotRunReport {
  readonly legalEntityId: string;
  /** `AAAA-MM`. */
  readonly month: string;
  readonly outcome: SettledInvoiceAutopilotOutcome;
}

/** Ce que le passage a tenté — vide presque toujours : un mois ne se tente qu'une fois. */
export interface InvoiceAutopilotReport {
  readonly runs: readonly InvoiceAutopilotRunReport[];
}

/**
 * **Le passage automatique de la facture du mois** (plan
 * `plan-emission-de-la-facture.md`, lot E4) : sur le Cron Trigger horaire de
 * l'automatisme du prélèvement (`15 * * * *`), AVANT lui — le dernier jour du
 * mois à 22h15, puis à chaque heure s'il a été manqué. Sans charge utile.
 */
export class RunInvoiceAutopilotCommand {}
