import { Inject, Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import type { InvoiceIssuedMailData } from "../../../../platform/mailer/invoice-issued-mail.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceNoticeEvent } from "../../domain/events/invoice.events.js";
import { InvoiceMailOrigins } from "../../domain/ports/invoice-mail-origins.js";
import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { InvoiceSiteContactsReader } from "../../domain/ports/invoice-site-contacts.reader.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { PayerNoticeContactsReader } from "../../domain/ports/payer-notice-contacts.reader.js";
import {
  invoiceNoticeRecipients,
  type InvoiceRecipient,
} from "../../domain/services/invoice-notice-recipients.js";
import { invoiceNoticeContent } from "../../domain/services/invoice-notice-wording.js";
import type { InvoiceDocument } from "../invoice-document-support.js";

/** Longueur gardée d'un refus du fournisseur : un témoin, pas une pile. */
const MAX_FAILURE_LENGTH = 500;

/** L'ancre de « Mes factures » dans `/mon-compte`. */
export const INVOICES_PATH = "/mon-compte#compte-invoices";

const NO_RECIPIENT =
  "personne à prévenir : le payeur n'a ni contact de facturation ni détenteur joignable, " +
  "et aucun sous-compte de la facture n'a de rôle facturation. Renseigner un contact de " +
  "facturation sur la fiche du payeur ; la facture reste consultable dans « Mes factures ».";

/** L'issue d'un envoi : à qui, et le refus du fournisseur (`null` : tout accepté). */
export interface InvoiceNoticeOutcome {
  readonly recipients: readonly InvoiceRecipient[];
  readonly failure: string | null;
}

/**
 * **Prévient de l'émission d'une facture** (plan
 * `plan-emission-de-la-facture.md`, E6, Q3) : un e-mail par adresse, puis
 * l'issue au journal — `invoice.notice_sent`, ou `invoice.notice_failed`
 * quand personne n'est joignable ou que le fournisseur refuse.
 *
 * Hors de toute transaction pendant les appels au fournisseur ; seul le fait
 * de journal s'écrit dans la sienne. La clé d'idempotence est la facture ET
 * l'adresse : un second passage ne fait pas partir de second message chez
 * Resend, et ajouter un destinataire n'empêche pas les autres de partir.
 *
 * Le PDF/A-3 Factur-X (E3b) est reçu de l'abonné, qui l'a fait rendre
 * avant : il part en pièce jointe. `null` (rendu en échec, journalisé) :
 * l'e-mail part sans.
 */
@Injectable()
export class InvoiceNoticeSender {
  constructor(
    private readonly invoices: InvoiceReader,
    private readonly periods: InvoicePeriodsReader,
    private readonly payers: PayerNoticeContactsReader,
    private readonly sites: InvoiceSiteContactsReader,
    private readonly origins: InvoiceMailOrigins,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    @Inject(MAILER) private readonly mailer: B2bMailer,
  ) {}

  /** @returns les destinataires prévenus ; `null` si rien n'était à envoyer (avoir, facture absente). */
  async send(
    invoiceId: string,
    document: InvoiceDocument | null,
  ): Promise<readonly InvoiceRecipient[] | null> {
    const outcome = await this.deliverNotice(invoiceId, document, null);
    return outcome === null ? null : outcome.recipients;
  }

  /**
   * **Le renvoi** demandé par le staff (E6, suite (b)) : les destinataires
   * d'aujourd'hui, sous une clé d'idempotence propre au renvoi
   * (`invoice.notice-resend:<renvoi>:<adresse>`) — celle de l'envoi
   * d'origine ferait taire le fournisseur. Issue au journal
   * `invoice.notice_resent`. Personne à prévenir : rien ne part, rien n'est
   * journalisé, l'appelant refuse.
   *
   * @returns les destinataires et le refus du fournisseur ; `null` si rien n'était à envoyer.
   */
  resend(
    invoiceId: string,
    document: InvoiceDocument | null,
    resendId: string,
  ): Promise<InvoiceNoticeOutcome | null> {
    return this.deliverNotice(invoiceId, document, resendId);
  }

  private async deliverNotice(
    invoiceId: string,
    document: InvoiceDocument | null,
    resendId: string | null,
  ): Promise<InvoiceNoticeOutcome | null> {
    const invoice = await this.invoices.byId(invoiceId);
    if (invoice === null) {
      return null;
    }
    const data = await this.mailDataOf(invoice, document);
    if (data === null) {
      return null;
    }
    const recipients = await this.recipientsOf(invoice);
    if (resendId !== null && recipients.length === 0) {
      return { recipients, failure: NO_RECIPIENT };
    }
    const keyOf = (email: string): string =>
      resendId === null
        ? `invoice.notice:${invoice.id}:${email.toLowerCase()}`
        : `invoice.notice-resend:${resendId}:${email.toLowerCase()}`;
    const failure =
      recipients.length === 0 ? NO_RECIPIENT : await this.deliver(data, recipients, keyOf);
    await this.uow.run(() =>
      this.events.publishTraced(
        new InvoiceNoticeEvent(
          invoice,
          recipients.length,
          failure,
          this.clock.now(),
          resendId !== null,
        ),
      ),
    );
    return { recipients, failure };
  }

  /** Le contenu de l'e-mail ; `null` pour un avoir (Q3 ne prévient qu'à la facture). */
  private async mailDataOf(
    invoice: Invoice,
    document: InvoiceDocument | null,
  ): Promise<InvoiceIssuedMailData | null> {
    const state = invoice.toState();
    const period = (await this.periods.periodsOf([state.id])).get(state.id) ?? null;
    const client = this.origins.clientBaseUrl();
    const content = invoiceNoticeContent(
      state,
      period,
      client === null ? "" : `${client}${INVOICES_PATH}`,
    );
    if (content === null) {
      return null;
    }
    return {
      ...content,
      // Aucune langue de destinataire n'existe encore (cf. `mail-copy.ts`).
      locale: DEFAULT_MAIL_LOCALE,
      document:
        document === null
          ? null
          : { fileName: document.fileName, pdfBase64: document.bytes.toString("base64") },
    };
  }

  private async recipientsOf(invoice: Invoice): Promise<readonly InvoiceRecipient[]> {
    const state = invoice.toState();
    const payerId = state.buyer.companyId;
    const payer = (await this.payers.contactsOf([payerId])).get(payerId);
    const sites = await this.sites.billingEmailsOf(
      state.orders.map((order) => order.orderId),
      payerId,
    );
    return invoiceNoticeRecipients(payer, sites);
  }

  /** @returns `null` si le fournisseur a tout accepté, sinon ses refus. */
  private async deliver(
    data: InvoiceIssuedMailData,
    recipients: readonly InvoiceRecipient[],
    keyOf: (email: string) => string,
  ): Promise<string | null> {
    const refusals: string[] = [];
    for (const recipient of recipients) {
      try {
        await this.mailer.send({
          to: recipient.email,
          template: "customer.invoice-issued",
          data,
          idempotencyKey: keyOf(recipient.email),
        });
      } catch (cause: unknown) {
        refusals.push(cause instanceof Error ? cause.message : String(cause));
      }
    }
    if (refusals.length === 0) {
      return null;
    }
    return `${String(refusals.length)} envoi(s) refusé(s) sur ${String(recipients.length)} : ${refusals.join(" ; ")}`.slice(
      0,
      MAX_FAILURE_LENGTH,
    );
  }
}
