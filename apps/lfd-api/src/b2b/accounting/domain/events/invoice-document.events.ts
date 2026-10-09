import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { Invoice } from "../entities/invoice.js";
import { INVOICE_FACT_TYPES } from "./accounting-facts.js";

/**
 * Les faits du **PDF/A-3 Factur-X** d'une pièce (plan
 * `facture-emise.md`). Jamais la clé de stockage : elle
 * ne dit rien au lecteur du journal, et elle nomme un objet du seau.
 */

function documentPayload(invoice: Invoice): Record<string, unknown> {
  const state = invoice.toState();
  return {
    subjectLabel: state.number,
    payer: { id: state.buyer.companyId, name: state.buyer.name },
    kind: invoice.isCreditNote ? "credit_note" : "invoice",
  };
}

/** Le PDF est rendu, rangé et attaché — sa taille et son empreinte. */
export class InvoiceDocumentRenderedEvent implements JournaledEvent {
  constructor(
    readonly invoice: Invoice,
    readonly byteCount: number,
    readonly sha256: string,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: INVOICE_FACT_TYPES.documentRendered,
      subjectType: "invoice",
      subjectId: this.invoice.id,
      occurredAt: this.at,
      payload: { ...documentPayload(this.invoice), byteCount: this.byteCount, sha256: this.sha256 },
    };
  }
}

/** Le rendu a échoué : la pièce reste sans PDF, la raison en clair. */
export class InvoiceDocumentRenderFailedEvent implements JournaledEvent {
  constructor(
    readonly invoice: Invoice,
    readonly failure: string,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: INVOICE_FACT_TYPES.documentRenderFailed,
      subjectType: "invoice",
      subjectId: this.invoice.id,
      occurredAt: this.at,
      payload: { ...documentPayload(this.invoice), failure: this.failure },
    };
  }
}
