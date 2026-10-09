import { Injectable, Logger } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import { INVOICE_ISSUED, InvoiceIssuedFact } from "../../domain/events/invoice-issued.fact.js";
import { InvoiceDocumentRenderer } from "../services/invoice-document-renderer.js";
import { InvoiceNoticeSender } from "../services/invoice-notice-sender.js";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_INVOICE_NOTICE = "accounting.send-invoice-notice";

/**
 * **« Votre facture FA-… » part** — l'abonné durable du fait
 * `invoice.issued` (plan `facture-emise.md`, Q3). Le fait
 * est écrit dans la transaction qui a pris le numéro ; le relais le livre
 * après sa validation, et le balayage du cron rattrape un réveil manqué.
 *
 * Même patron que `SendCollectionNotice` : seul le décodage se fait dans la
 * transaction du reçu ; l'envoi part APRÈS, hors transaction, et son issue
 * s'écrit au journal (`invoice.notice_sent` | `invoice.notice_failed`).
 *
 * **Le PDF d'abord, puis l'e-mail** (E3b) : l'envoi attend le rendu
 * (`InvoiceDocumentRenderer.ensure`, idempotent — une pièce déjà rendue rend
 * son PDF rangé) et part avec la pièce jointe. Un seul abonné pour les deux,
 * pour qu'ils ne se courent pas après sur la même pièce. Un rendu en échec
 * est journalisé, et l'e-mail part quand même, sans pièce : la facture ne
 * dépend pas de son PDF pour être due.
 *
 * ⚠️ Un redémarrage entre la validation du reçu et l'envoi ne laisse aucune
 * trace d'envoi au journal : la facture, elle, reste dans « Mes factures ».
 * Le staff peut renvoyer l'e-mail (`ResendInvoiceNoticeCommand`, E6 (b)).
 */
@Injectable()
@DurableHandler({ type: INVOICE_ISSUED, subscriber: SEND_INVOICE_NOTICE })
export class SendInvoiceNotice implements DurableSubscriber {
  private readonly logger = new Logger(SendInvoiceNotice.name);

  constructor(
    private readonly documents: InvoiceDocumentRenderer,
    private readonly sender: InvoiceNoticeSender,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  handle(delivery: DurableDelivery): Promise<void> {
    const fact = InvoiceIssuedFact.fromPayload(delivery.payload);
    this.afterCommit.defer(
      () => this.work.track(this.sendLogged(fact.invoiceId), SEND_INVOICE_NOTICE),
      SEND_INVOICE_NOTICE,
    );
    return Promise.resolve();
  }

  /** Ne lève jamais : l'issue est au journal, un incident est journalisé. */
  private async sendLogged(invoiceId: string): Promise<void> {
    try {
      const document = await this.documents.ensure(invoiceId);
      await this.sender.send(invoiceId, document);
    } catch (cause: unknown) {
      this.logger.error(`Facture ${invoiceId} : e-mail « votre facture » non envoyé`, cause);
    }
  }
}
