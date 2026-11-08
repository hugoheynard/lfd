import { Injectable } from "@nestjs/common";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import type { ByReference } from "../../../../mail/channels/requests/mail.js";
import type { InvoiceIssuedMailData } from "../../../../mail/channels/templates/b2b-mails.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { MailSubject } from "../../../../mail/channels/requests/mail-subject.js";
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

/** Le modèle de l'e-mail. */
const TEMPLATE = "customer.invoice-issued";

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

/** Ce qu'un envoi a à dire : la facture, les mots sans la pièce, et à qui. */
interface NoticeSubject {
  readonly invoice: Invoice;
  readonly content: Omit<InvoiceIssuedMailData, "document">;
  readonly recipients: readonly InvoiceRecipient[];
}

/**
 * **Prévient de l'émission d'une facture** (plan
 * `facture-emise.md`, Q3) : un e-mail par adresse, puis
 * l'issue au journal.
 *
 * **L'envoi d'origine DEMANDE** (`send`, plan service d'e-mails, S2d) : les
 * demandes et le fait `invoice.notice_sent` s'écrivent dans une même
 * transaction, et le bloc `mail` envoie après la validation. La pièce passe
 * PAR RÉFÉRENCE : le PDF/A-3 Factur-X est déjà rangé au stockage des pièces
 * client sous `Invoice.documentKey` (`InvoiceDocumentRenderer.ensure`, appelé
 * avant par l'abonné) — la demande porte cette clé, rien n'est rangé deux
 * fois. Pas de PDF rendu (`null`) ou pas de clé : l'e-mail part sans.
 *
 * **Le renvoi du staff ENVOIE** (`sendAndAwaitReceipt`) : il attend la réponse, et un
 * refus du fournisseur s'affiche (409 nommé) autant qu'il se journalise.
 *
 * La clé d'idempotence est la facture (ou le renvoi) ET l'IDENTIFIANT STABLE
 * du destinataire (`contact:<id>`, `user:<id>`), jamais son adresse : le bloc
 * garde la clé un an. Le rang, qui la portait jusqu'au 2026-11-06, taisait un
 * destinataire décalé quand la liste changeait entre deux passages (revue du
 * service d'e-mails, cas 4).
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
    private readonly mail: Mail,
  ) {}

  /**
   * Demande un e-mail par destinataire, et journalise `invoice.notice_sent`
   * (« demandé ») ou `invoice.notice_failed` (personne à prévenir). Une
   * demande refusée annule le tout et lève : l'abonné le journalise.
   *
   * @param document le PDF rendu, ou `null` (rendu en échec) : sa clé est relue sur la facture.
   * @returns les destinataires ; `null` si rien n'était à envoyer (avoir, facture absente).
   */
  async send(
    invoiceId: string,
    document: InvoiceDocument | null,
  ): Promise<readonly InvoiceRecipient[] | null> {
    const subject = await this.subjectOf(invoiceId);
    if (subject === null) {
      return null;
    }
    const { invoice, content, recipients } = subject;
    const key = document === null ? null : invoice.toState().documentKey;
    const data = {
      ...content,
      document:
        document === null || key === null
          ? null
          : {
              fileName: document.fileName,
              pdfStored: { store: "customer-documents" as const, key },
            },
    };
    await this.uow.run(async () => {
      for (const recipient of recipients) {
        await this.mail.send({
          template: TEMPLATE,
          to: recipient.email,
          data,
          subjects: invoiceMailSubjects(invoice),
          idempotencyKey: `invoice.notice:${invoice.id}:${recipient.id}`,
        });
      }
      await this.journal(invoice, recipients, recipients.length === 0 ? NO_RECIPIENT : null, false);
    });
    return recipients;
  }

  /**
   * **Le renvoi** demandé par le staff (E6, suite (b)) : les destinataires
   * d'aujourd'hui, sous une clé d'idempotence propre au renvoi
   * (`invoice.notice-resend:<renvoi>:<destinataire>`) — celle de l'envoi d'origine
   * ferait taire le bloc. Issue au journal `invoice.notice_resent`. Personne
   * à prévenir : rien ne part, rien n'est journalisé, l'appelant refuse.
   *
   * Hors de toute transaction (exigence de `sendAndAwaitReceipt`).
   *
   * @returns les destinataires et le refus du fournisseur ; `null` si rien n'était à envoyer.
   */
  async resend(
    invoiceId: string,
    document: InvoiceDocument | null,
    resendId: string,
  ): Promise<InvoiceNoticeOutcome | null> {
    const subject = await this.subjectOf(invoiceId);
    if (subject === null) {
      return null;
    }
    const { invoice, content, recipients } = subject;
    if (recipients.length === 0) {
      return { recipients, failure: NO_RECIPIENT };
    }
    // L'exemplaire rangé à l'émission, comme au premier envoi : le renvoi joint
    // le MÊME fichier, jamais un rendu refait (revue du service d'e-mails, cas 7).
    const key = document === null ? null : invoice.toState().documentKey;
    const data = {
      ...content,
      document:
        document === null || key === null
          ? null
          : {
              fileName: document.fileName,
              pdfStored: { store: "customer-documents" as const, key },
            },
    };
    const failure = await this.sendEach(data, recipients, resendId, invoiceMailSubjects(invoice));
    await this.uow.run(() => this.journal(invoice, recipients, failure, true));
    return { recipients, failure };
  }

  private journal(
    invoice: Invoice,
    recipients: readonly InvoiceRecipient[],
    failure: string | null,
    resent: boolean,
  ): Promise<void> {
    return this.events.publishTraced(
      new InvoiceNoticeEvent(invoice, recipients.length, failure, this.clock.now(), resent),
    );
  }

  /** La facture, ses mots et ses destinataires ; `null` pour une pièce absente ou un avoir. */
  private async subjectOf(invoiceId: string): Promise<NoticeSubject | null> {
    const invoice = await this.invoices.byId(invoiceId);
    if (invoice === null) {
      return null;
    }
    const content = await this.contentOf(invoice);
    if (content === null) {
      return null;
    }
    return { invoice, content, recipients: await this.recipientsOf(invoice) };
  }

  /** Les mots de l'e-mail ; `null` pour un avoir (Q3 ne prévient qu'à la facture). */
  private async contentOf(
    invoice: Invoice,
  ): Promise<Omit<InvoiceIssuedMailData, "document"> | null> {
    const state = invoice.toState();
    const period = (await this.periods.periodsOf([state.id])).get(state.id) ?? null;
    // La période du payeur, rangée à l'émission (M4a) : « commandes du 5 au
    // 11 octobre 2026 ».
    const client = this.origins.clientBaseUrl();
    const content = invoiceNoticeContent(
      state,
      period,
      client === null ? "" : `${client}${INVOICES_PATH}`,
    );
    if (content === null) {
      return null;
    }
    // Aucune langue de destinataire n'existe encore (cf. `mail-copy.ts`).
    return { ...content, locale: DEFAULT_MAIL_LOCALE };
  }

  private async recipientsOf(invoice: Invoice): Promise<readonly InvoiceRecipient[]> {
    const state = invoice.toState();
    const payerId = state.buyer.companyId;
    const payer = (await this.payers.contactsOf([payerId])).get(payerId);
    const sites = await this.sites.billingContactsOf(
      state.orders.map((order) => order.orderId),
      payerId,
    );
    return invoiceNoticeRecipients(payer, sites);
  }

  /** @returns `null` si le fournisseur a tout accepté, sinon ses refus. */
  private async sendEach(
    data: ByReference<InvoiceIssuedMailData>,
    recipients: readonly InvoiceRecipient[],
    resendId: string,
    subjects: readonly MailSubject[],
  ): Promise<string | null> {
    const refusals: string[] = [];
    for (const recipient of recipients) {
      try {
        await this.mail.sendAndAwaitReceipt({
          template: TEMPLATE,
          to: recipient.email,
          data,
          subjects,
          idempotencyKey: `invoice.notice-resend:${resendId}:${recipient.id}`,
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

/**
 * Les sujets d'un avis de facture : la facture, sa société payeuse et CHACUNE
 * de ses commandes — la fiche d'une commande retrouve ainsi sa facture (plan
 * `plan-sujet-des-e-mails.md`, règle 2).
 */
export function invoiceMailSubjects(invoice: Invoice): readonly MailSubject[] {
  const state = invoice.toState();
  return [
    { type: "invoice", id: state.id },
    { type: "company", id: state.buyer.companyId },
    ...state.orders.map((order) => ({ type: "order" as const, id: order.orderId })),
  ];
}
