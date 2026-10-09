import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { InvoiceIssuedPayloadError } from "./invoice-issued.fact.js";

/** Nom STABLE du fait durable — clé de routage vers son abonné (le rendu, E3b). */
export const CREDIT_NOTE_ISSUED = "invoice.credit_note_issued";

/**
 * **Un avoir (381) est émis** — écrit dans la boîte d'envoi, dans la
 * transaction qui a pris son numéro (plan `facture-emise.md`). Un avoir ne prévient personne (Q3), mais il a son PDF/A-3 comme la
 * facture : c'est le seul abonné. Clé : `invoice.credit_note_issued:<id>`,
 * une pièce ne s'émet qu'une fois.
 */
export class CreditNoteIssuedFact implements DurableEvent {
  constructor(readonly invoiceId: string) {}

  durableFact(): DurableFact {
    return {
      type: CREDIT_NOTE_ISSUED,
      key: `${CREDIT_NOTE_ISSUED}:${this.invoiceId}`,
      payload: { invoiceId: this.invoiceId },
    };
  }

  /** @throws {InvoiceIssuedPayloadError} */
  static fromPayload(payload: Readonly<Record<string, unknown>>): CreditNoteIssuedFact {
    const invoiceId = payload["invoiceId"];
    if (typeof invoiceId !== "string" || invoiceId.length === 0) {
      throw new InvoiceIssuedPayloadError();
    }
    return new CreditNoteIssuedFact(invoiceId);
  }
}
