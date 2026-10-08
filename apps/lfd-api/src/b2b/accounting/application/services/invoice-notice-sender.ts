import { Inject, Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
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
import {
  invoiceNoticeContent,
  type InvoiceNoticeContent,
} from "../../domain/services/invoice-notice-wording.js";

/** Longueur gardée d'un refus du fournisseur : un témoin, pas une pile. */
const MAX_FAILURE_LENGTH = 500;

/** L'ancre de « Mes factures » dans `/mon-compte`. */
export const INVOICES_PATH = "/mon-compte#compte-invoices";

const NO_RECIPIENT =
  "personne à prévenir : le payeur n'a ni contact de facturation ni détenteur joignable, " +
  "et aucun sous-compte de la facture n'a de rôle facturation. Renseigner un contact de " +
  "facturation sur la fiche du payeur ; la facture reste consultable dans « Mes factures ».";

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
 * ⚠️ **Pas de PDF joint** tant que le rendu PDF/A-3 (E3b) n'existe pas. Le
 * point d'extension est `attachmentsOf` : il rendra le document Factur-X
 * déposé (`documentKey`), et le gabarit n'a rien à changer.
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
  async send(invoiceId: string): Promise<readonly InvoiceRecipient[] | null> {
    const invoice = await this.invoices.byId(invoiceId);
    if (invoice === null) {
      return null;
    }
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
    const recipients = await this.recipientsOf(invoice);
    const failure =
      recipients.length === 0 ? NO_RECIPIENT : await this.deliver(invoice, content, recipients);
    await this.uow.run(() =>
      this.events.publishTraced(
        new InvoiceNoticeEvent(invoice, recipients.length, failure, this.clock.now()),
      ),
    );
    return recipients;
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
    invoice: Invoice,
    content: InvoiceNoticeContent,
    recipients: readonly InvoiceRecipient[],
  ): Promise<string | null> {
    const refusals: string[] = [];
    for (const recipient of recipients) {
      try {
        await this.mailer.send({
          to: recipient.email,
          template: "customer.invoice-issued",
          data: content,
          idempotencyKey: `invoice.notice:${invoice.id}:${recipient.email.toLowerCase()}`,
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
