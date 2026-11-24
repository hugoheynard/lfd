import { Injectable } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { PeriodQuoteSnapshot } from "../../domain/entities/period-quote.js";
import { PeriodQuoteNoticeFailedEvent } from "../../domain/events/period-quote.events.js";
import { PayerNoticeContactsReader } from "../../domain/ports/payer-notice-contacts.reader.js";
import { payerNoticeRecipientOf } from "../../domain/services/collection-notice-recipient.js";
import { noticeAmount } from "../../domain/services/collection-notice-wording.js";
import { periodQuotePeriod } from "../../domain/services/period-quote-pdf-parts.js";
import type { PeriodQuoteDocument } from "./period-quote-document-renderer.js";

/** Le modèle de l'e-mail. */
const TEMPLATE = "customer.period-quote";

/**
 * **Demande l'e-mail « Devis D-… »** (QD4) : au destinataire de la facture
 * du payeur (`payerNoticeRecipientOf` — son contact de facturation le plus
 * ancien, sinon son détenteur), le PDF rangé joint PAR RÉFÉRENCE.
 *
 * `mail.send` : la demande s'écrit dans la transaction de l'appelant (ou la
 * sienne), et le bloc `mail` envoie après la validation.
 *
 * La clé d'idempotence est donnée par l'appelant, à partir de l'identifiant
 * stable du destinataire (`contact:<id>`, `user:<id>`), jamais de son
 * adresse : `period-quote:<devis>:<destinataire>` à l'envoi automatique, la
 * clé de l'intention de l'écran au renvoi.
 */
@Injectable()
export class PeriodQuoteNoticeSender {
  constructor(
    private readonly payers: PayerNoticeContactsReader,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly mail: Mail,
  ) {}

  /**
   * Le manque au journal (`period_quote.notice_failed`) : l'envoi automatique
   * n'a trouvé personne à prévenir — la règle de la facture.
   */
  noteNobodyToNotify(quote: PeriodQuoteSnapshot, failure: string): Promise<void> {
    return this.uow.run(() =>
      this.events.publishTraced(new PeriodQuoteNoticeFailedEvent(quote, failure, this.clock.now())),
    );
  }

  /** @returns le nombre de demandes écrites : 0 quand le payeur n'a personne à prévenir. */
  async request(
    quote: PeriodQuoteSnapshot,
    document: PeriodQuoteDocument,
    keyOf: (recipientId: string) => string,
  ): Promise<number> {
    const contacts = (await this.payers.contactsOf([quote.payerCompanyId])).get(
      quote.payerCompanyId,
    );
    const recipient = payerNoticeRecipientOf(contacts);
    if (recipient === null) {
      return 0;
    }
    await this.uow.run(() =>
      this.mail.send({
        template: TEMPLATE,
        to: recipient.email,
        data: {
          quoteNumber: quote.number,
          version: quote.version,
          sellerName: document.sellerName,
          buyerName: quote.payerName,
          period: periodQuotePeriod(quote),
          total: noticeAmount(quote.totalTtcCents),
          serviceCode: quote.serviceCode === "" ? null : quote.serviceCode,
          document: {
            fileName: document.fileName,
            pdfStored: { store: "customer-documents", key: document.key },
          },
          locale: DEFAULT_MAIL_LOCALE,
        },
        subjects: [
          { type: "period_quote", id: quote.id },
          { type: "company", id: quote.payerCompanyId },
        ],
        idempotencyKey: keyOf(recipient.id),
      }),
    );
    return 1;
  }
}

/** La clé de l'envoi automatique d'une version : une version ne part qu'une fois par destinataire. */
export function issuedQuoteMailKey(quoteId: string, recipientId: string): string {
  return `period-quote:${quoteId}:${recipientId}`;
}
