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
 * `plan-emission-de-la-facture.md`, lots E4 et E4b) : sur son cron propre,
 * `55 21,22 * * *` (UTC) — le dernier jour du mois à 23h55, heure de Paris —,
 * puis sur le passage horaire du prélèvement (`15 * * * *`), AVANT lui, s'il
 * a été manqué. Sans charge utile.
 */
export class RunInvoiceAutopilotCommand {}
