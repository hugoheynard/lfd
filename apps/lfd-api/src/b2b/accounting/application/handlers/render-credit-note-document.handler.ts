import { Injectable, Logger } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  CREDIT_NOTE_ISSUED,
  CreditNoteIssuedFact,
} from "../../domain/events/credit-note-issued.fact.js";
import { InvoiceDocumentRenderer } from "../services/invoice-document-renderer.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const RENDER_CREDIT_NOTE_DOCUMENT = "accounting.render-credit-note-document";

/**
 * **Le PDF/A-3 d'un avoir est rendu** — l'abonné durable du fait
 * `invoice.credit_note_issued` (plan `plan-emission-de-la-facture.md`, E3b).
 * Un avoir ne prévient personne (Q3) : rendre est tout ce qu'il y a à faire.
 *
 * Même patron que `SendInvoiceNotice` : le décodage dans la transaction du
 * reçu, le rendu APRÈS, hors transaction. Son issue est au journal
 * (`invoice.document_rendered` | `invoice.document_render_failed`).
 */
@Injectable()
@DurableHandler({ type: CREDIT_NOTE_ISSUED, subscriber: RENDER_CREDIT_NOTE_DOCUMENT })
export class RenderCreditNoteDocument implements DurableSubscriber {
  private readonly logger = new Logger(RenderCreditNoteDocument.name);

  constructor(
    private readonly documents: InvoiceDocumentRenderer,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  handle(delivery: DurableDelivery): Promise<void> {
    const fact = CreditNoteIssuedFact.fromPayload(delivery.payload);
    this.afterCommit.defer(
      () => this.work.track(this.renderLogged(fact.invoiceId), RENDER_CREDIT_NOTE_DOCUMENT),
      RENDER_CREDIT_NOTE_DOCUMENT,
    );
    return Promise.resolve();
  }

  /** Ne lève jamais : l'issue est au journal, un incident est journalisé. */
  private async renderLogged(invoiceId: string): Promise<void> {
    try {
      await this.documents.ensure(invoiceId);
    } catch (cause: unknown) {
      this.logger.error(`Avoir ${invoiceId} : PDF non rendu`, cause);
    }
  }
}
