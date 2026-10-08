import type { DurableEvent, DurableFact } from "../../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Nom STABLE du fait durable — clé de routage vers ses abonnés (« prévenir », lot E6). */
export const INVOICE_ISSUED = "invoice.issued";

/**
 * **Une facture (380) est émise** — écrit dans la boîte d'envoi, dans la
 * transaction qui a pris son numéro (plan `plan-emission-de-la-facture.md`,
 * E6). `{ invoiceId }`, rien d'autre : l'abonné relit la pièce figée. Clé :
 * `invoice.issued:<invoiceId>`, une pièce ne s'émet qu'une fois.
 *
 * Un avoir n'en publie pas : Q3 ne demande de prévenir qu'à l'émission de la
 * facture ; il a son propre fait (`CreditNoteIssuedFact`, E3b). Le rendu
 * Factur-X de la facture se fait dans l'abonné de ce fait-ci, AVANT
 * l'e-mail, pour que celui-ci parte avec sa pièce jointe.
 */
export class InvoiceIssuedFact implements DurableEvent {
  constructor(readonly invoiceId: string) {}

  durableFact(): DurableFact {
    return {
      type: INVOICE_ISSUED,
      key: `${INVOICE_ISSUED}:${this.invoiceId}`,
      payload: { invoiceId: this.invoiceId },
    };
  }

  /** @throws {InvoiceIssuedPayloadError} */
  static fromPayload(payload: Readonly<Record<string, unknown>>): InvoiceIssuedFact {
    const invoiceId = payload["invoiceId"];
    if (typeof invoiceId !== "string" || invoiceId.length === 0) {
      throw new InvoiceIssuedPayloadError();
    }
    return new InvoiceIssuedFact(invoiceId);
  }
}

/** Un fait illisible : rien n'est envoyé, le message reste dans la boîte d'envoi. */
export class InvoiceIssuedPayloadError extends TechnicalError {
  constructor() {
    super(
      "accounting.invoice.issued_payload_invalid",
      "Le fait « facture émise » est illisible (facture manquante) : personne n'a été prévenu. Corriger l'émetteur puis rejouer le message depuis la carte de santé.",
    );
  }
}
