import { Injectable, Logger } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import type { DurableDelivery } from "../../../../platform/outbox/durable-event.js";
import {
  DurableHandler,
  type DurableSubscriber,
} from "../../../../platform/outbox/durable-handler.js";
import {
  PERIOD_QUOTE_ISSUED,
  PeriodQuoteIssuedFact,
} from "../../domain/events/period-quote-issued.fact.js";
import { PeriodQuoteReader } from "../../domain/ports/period-quote.reader.js";
import { PeriodQuoteDocumentRenderer } from "../services/period-quote-document-renderer.js";
import {
  issuedQuoteMailKey,
  PeriodQuoteNoticeSender,
} from "../services/period-quote-notice-sender.js";

/** Ce que le journal dit d'un devis parti à personne, avec le geste de sortie. */
export const NO_QUOTE_RECIPIENT =
  "personne à prévenir : le payeur n'a ni contact de facturation ni détenteur joignable. " +
  "Renseigner un contact de facturation sur sa fiche, puis « Renvoyer le devis ».";

/** Nom STABLE de l'abonné — clé de son reçu dans la boîte d'envoi. */
export const SEND_PERIOD_QUOTE = "accounting.send-period-quote";

/**
 * **« Devis D-… » part** — l'abonné durable de `period_quote.issued` (QD4) :
 * le fait est écrit dans la transaction qui a rangé la version (clôture ou
 * renvoi) ; le relais le livre après sa validation.
 *
 * Le patron de `SendInvoiceNotice` : le décodage dans la transaction du
 * reçu ; le rendu et le rangement du PDF APRÈS, hors transaction (réseau),
 * puis la demande d'e-mail. **Le PDF d'abord** : un devis sans son document
 * n'aurait rien à retourner, l'e-mail ne part pas sans lui.
 *
 * Sans destinataire, l'envoi n'est pas tenté et le manque est journalisé
 * (`period_quote.notice_failed`), comme pour la facture ; le staff renseigne un contact et
 * utilise « Renvoyer le devis ». Un rendu refusé (commandes changées depuis
 * le rangement) est journalisé de même : le renvoi range une nouvelle
 * version.
 */
@Injectable()
@DurableHandler({ type: PERIOD_QUOTE_ISSUED, subscriber: SEND_PERIOD_QUOTE })
export class SendPeriodQuote implements DurableSubscriber {
  private readonly logger = new Logger(SendPeriodQuote.name);

  constructor(
    private readonly quotes: PeriodQuoteReader,
    private readonly documents: PeriodQuoteDocumentRenderer,
    private readonly sender: PeriodQuoteNoticeSender,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  handle(delivery: DurableDelivery): Promise<void> {
    const fact = PeriodQuoteIssuedFact.fromPayload(delivery.payload);
    this.afterCommit.defer(
      () => this.work.track(this.sendLogged(fact.quoteId), SEND_PERIOD_QUOTE),
      SEND_PERIOD_QUOTE,
    );
    return Promise.resolve();
  }

  /** Ne lève jamais : un incident est journalisé. */
  private async sendLogged(quoteId: string): Promise<void> {
    try {
      const quote = await this.quotes.byId(quoteId);
      if (quote === null || quote.state !== "awaiting") {
        return;
      }
      const document = await this.documents.ensure(quote);
      const sent = await this.sender.request(quote, document, (recipientId) =>
        issuedQuoteMailKey(quote.id, recipientId),
      );
      if (sent === 0) {
        await this.sender.noteNobodyToNotify(quote, NO_QUOTE_RECIPIENT);
      }
    } catch (cause: unknown) {
      this.logger.error(`Devis ${quoteId} : e-mail « devis de période » non envoyé`, cause);
    }
  }
}
