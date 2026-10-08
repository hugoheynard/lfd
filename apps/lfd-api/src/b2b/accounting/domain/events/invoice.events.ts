import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { Invoice } from "../entities/invoice.js";
import { INVOICE_FACT_TYPES } from "./accounting-facts.js";

const INVOICE_SUBJECT = "invoice";

/** Ce que les deux faits disent de la pièce : son numéro, ses parties du jour, son total. */
function invoicePayload(invoice: Invoice): Record<string, unknown> {
  const state = invoice.toState();
  return {
    subjectLabel: state.number,
    legalEntity: { id: state.legalEntityId, name: state.seller.name },
    payer: { id: state.buyer.companyId, name: state.buyer.name },
    issuedOn: state.issuedOn,
    orderCount: state.orders.length,
    totalCents: state.vat.totalCents,
  };
}

/** Une facture (380) vient d'être émise, dans la transaction qui a pris son numéro. */
export class InvoiceIssuedEvent implements JournaledEvent {
  constructor(
    readonly invoice: Invoice,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: INVOICE_FACT_TYPES.issued,
      subjectType: INVOICE_SUBJECT,
      subjectId: this.invoice.id,
      occurredAt: this.at,
      payload: invoicePayload(this.invoice),
    };
  }
}

/** Un avoir (381) vient d'être émis sur une facture, qu'il cite par son numéro. */
export class CreditNoteIssuedEvent implements JournaledEvent {
  constructor(
    readonly creditNote: Invoice,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    const state = this.creditNote.toState();
    return {
      type: INVOICE_FACT_TYPES.creditNoteIssued,
      subjectType: INVOICE_SUBJECT,
      subjectId: state.id,
      occurredAt: this.at,
      payload: {
        ...invoicePayload(this.creditNote),
        correctedInvoice: {
          id: state.correctedInvoiceId,
          name: state.correctedInvoiceNumber,
        },
      },
    };
  }
}
