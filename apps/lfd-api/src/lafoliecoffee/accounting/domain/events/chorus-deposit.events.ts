import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { ChorusDepositEntry, ChorusInvoiceFacts } from "../entities/chorus-deposit.js";
import { INVOICE_FACT_TYPES } from "./accounting-facts.js";

const INVOICE_SUBJECT = "invoice";

const TYPES = {
  deposited: INVOICE_FACT_TYPES.chorusDeposited,
  rejected: INVOICE_FACT_TYPES.chorusRejected,
  accepted: INVOICE_FACT_TYPES.chorusAccepted,
} as const;

/**
 * Un geste noté du dépôt sur Chorus Pro (plan `plan-clients-publics-chorus.md`,
 * T5′) : déposée, rejetée (avec le motif), mise en paiement. Sujet : la
 * facture ; l'auteur est l'acteur de la requête, posé par le journal.
 */
export class ChorusDepositNotedEvent implements JournaledEvent {
  constructor(
    readonly invoice: ChorusInvoiceFacts,
    readonly entry: ChorusDepositEntry,
  ) {}

  journalFact(): JournalFact {
    return {
      type: TYPES[this.entry.kind],
      subjectType: INVOICE_SUBJECT,
      subjectId: this.invoice.invoiceId,
      occurredAt: this.entry.recordedAt,
      payload: {
        subjectLabel: this.invoice.number,
        payer: { id: this.invoice.payerCompanyId, name: this.invoice.payerName },
        occurredOn: this.entry.occurredOn,
        ...(this.entry.reason === null ? {} : { reason: this.entry.reason }),
      },
    };
  }
}
