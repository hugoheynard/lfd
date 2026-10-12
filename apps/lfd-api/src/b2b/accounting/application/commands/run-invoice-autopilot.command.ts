import type { SettledInvoiceAutopilotOutcome } from "../../domain/ports/invoice-autopilot-runs.js";

/** Une tentative faite par CE passage. */
export interface InvoiceAutopilotRunReport {
  readonly legalEntityId: string;
  /** ISO — la clôture tentée (R3). */
  readonly periodClosesAt: string;
  readonly outcome: SettledInvoiceAutopilotOutcome;
}

/** Ce que le passage a tenté — vide presque toujours : une clôture ne se tente qu'une fois. */
export interface InvoiceAutopilotReport {
  readonly runs: readonly InvoiceAutopilotRunReport[];
}

/**
 * **Le passage automatique de la facture par période** (plans
 * `facture-emise.md`, `plan-rythme-de-facturation.md` R3) : sur son cron
 * propre, `55 21,22 * * *` (UTC) — chaque soir à 23h55, heure de Paris, la
 * veille d'une clôture éventuelle —, puis sur le passage horaire du
 * prélèvement (`15 * * * *`), AVANT lui, pour rattraper les clôtures
 * manquées. Sans charge utile.
 */
export class RunInvoiceAutopilotCommand {}
