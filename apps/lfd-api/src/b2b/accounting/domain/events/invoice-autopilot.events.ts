import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { SettledInvoiceAutopilotOutcome } from "../ports/invoice-autopilot-runs.js";
import type { BillingCycle } from "../services/billing-cycle.js";
import { periodLabelOf, periodMonthOf } from "../services/invoicing-closures.js";
import { INVOICE_FACT_TYPES } from "./accounting-facts.js";

/**
 * La période d'un fait de la facture (M4a) : `month` (`AAAA-MM`, gardé pour
 * les lecteurs d'avant), la clôture et le libellé — « du 5 au 11 octobre
 * 2026 » pour un payeur hebdomadaire, que le mois ne savait pas dire.
 */
function periodPayload(period: BillingCycle): {
  readonly month: string;
  readonly periodClosesAt: string;
  readonly periodLabel: string;
} {
  return {
    month: periodMonthOf(period.closesAt),
    periodClosesAt: period.closesAt.toISOString(),
    periodLabel: periodLabelOf(period),
  };
}

/** L'entité émettrice dont le passage a tenté la clôture, avec son nom du moment. */
export interface InvoiceAutopilotEntity {
  readonly id: string;
  readonly name: string;
}

/** Ce qu'un passage automatique a donné. */
export interface InvoiceAutopilotIssue {
  readonly outcome: SettledInvoiceAutopilotOutcome;
  readonly issuedCount: number;
  readonly signalledCount: number;
  readonly message: string | null;
}

/**
 * **Le passage automatique a tenté la facture du mois** (lot E4) — copie
 * exacte de `collection.autopilot_ran`. Un refus de l'automatisme ne doit pas
 * se lire seulement dans `invoice_autopilot_run`, que personne n'ouvre ; les
 * factures émises ont, elles, leur propre fait (`invoice.issued`).
 */
export class InvoiceAutopilotRanEvent implements JournaledEvent {
  constructor(
    readonly entity: InvoiceAutopilotEntity,
    /** La période affichée de la clôture tentée — la plus longue qui s'y clôt. */
    readonly period: BillingCycle,
    readonly issue: InvoiceAutopilotIssue,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: INVOICE_FACT_TYPES.autopilotRan,
      subjectType: "legal_entity",
      subjectId: this.entity.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: this.entity.name,
        ...periodPayload(this.period),
        outcome: this.issue.outcome,
        issuedCount: this.issue.issuedCount,
        signalledCount: this.issue.signalledCount,
        message: this.issue.message,
      },
    };
  }
}

/** Le payeur signalé, avec son nom du moment. */
export interface SignalledPayer {
  readonly id: string;
  readonly name: string;
}

/**
 * **Un payeur est signalé** par la facture du mois : sa facture n'est pas
 * émise, la raison est rangée dans `invoice_monthly_outcome` et dite ici.
 *
 * ⚠️ Jamais de montant : ce qui n'a pas été facturé n'est pas une somme due,
 * et un chiffre au journal se relirait comme tel des années après.
 */
export class InvoiceSignalledEvent implements JournaledEvent {
  constructor(
    readonly payer: SignalledPayer,
    /** La période DU PAYEUR, celle que sa facture aurait portée. */
    readonly period: BillingCycle,
    readonly reason: string,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: INVOICE_FACT_TYPES.signalled,
      subjectType: "company",
      subjectId: this.payer.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: this.payer.name,
        ...periodPayload(this.period),
        reason: this.reason,
      },
    };
  }
}
