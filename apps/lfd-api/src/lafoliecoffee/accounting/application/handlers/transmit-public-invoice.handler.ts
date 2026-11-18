import { Injectable } from "@nestjs/common";

import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { INVOICE_ISSUED, InvoiceIssuedFact } from "../../domain/events/invoice-issued.fact.js";
import { EInvoiceTransport } from "../../domain/ports/e-invoice-transport.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { dueFactsOf } from "../../domain/services/facturx-mentions.js";
import { isPublicInvoice } from "../../domain/services/public-invoice-due.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const TRANSMIT_PUBLIC_INVOICE = "accounting.transmit-public-invoice";

/**
 * **Une facture d'organisme public part vers son portail** — l'abonné durable
 * du fait `invoice.issued` (plan `plan-clients-publics-chorus.md`, T4). Toute
 * autre pièce est ignorée. Le transport branché (`ManualChorusDeposit`)
 * n'envoie rien : la facture attend dans la file « À déposer ». Une pièce
 * introuvable est ignorée — l'émission l'a écrite dans la même transaction
 * que le fait.
 */
@Injectable()
@DurableHandler({ type: INVOICE_ISSUED, subscriber: TRANSMIT_PUBLIC_INVOICE })
export class TransmitPublicInvoice implements DurableSubscriber {
  constructor(
    private readonly invoices: InvoiceReader,
    private readonly transport: EInvoiceTransport,
  ) {}

  async handle(delivery: DurableDelivery): Promise<void> {
    const fact = InvoiceIssuedFact.fromPayload(delivery.payload);
    const invoice = await this.invoices.byId(fact.invoiceId);
    if (invoice === null) {
      return;
    }
    const state = invoice.toState();
    if (isPublicInvoice(dueFactsOf(state))) {
      await this.transport.transmit({ invoiceId: state.id, number: state.number });
    }
  }
}
