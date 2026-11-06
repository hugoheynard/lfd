import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { InvoiceNotFoundError } from "../../domain/errors/invoice-access-errors.js";
import {
  InvoiceNoticeNobodyToNotifyError,
  InvoiceNoticeNotForCreditNoteError,
  InvoiceNoticeResendRefusedError,
} from "../../domain/errors/invoice-notice-errors.js";
import { InvoiceReader } from "../../domain/ports/invoice.reader.js";
import { InvoiceDocumentRenderer } from "../services/invoice-document-renderer.js";
import { InvoiceNoticeSender } from "../services/invoice-notice-sender.js";
import { ResendInvoiceNoticeCommand } from "./resend-invoice-notice.command.js";

/**
 * Renvoie « Votre facture » aux destinataires d'aujourd'hui, PDF joint
 * (rendu au passage s'il manquait), sous la clé d'intention de l'écran
 * (revue, cas 4) : un double clic ne renvoie rien, un nouveau « Renvoyer »
 * porte une clé neuve et repart. Fait `invoice.notice_resent`.
 *
 * Synchrone, à la différence de l'envoi d'origine : le staff attend la
 * réponse, et un refus se lit à l'écran (409 nommé) autant qu'au journal.
 *
 * @throws {InvoiceNotFoundError} la pièce n'existe pas.
 * @throws {InvoiceNoticeNotForCreditNoteError} c'est un avoir.
 * @throws {InvoiceNoticeNobodyToNotifyError} personne à prévenir, rien n'est parti.
 * @throws {InvoiceNoticeResendRefusedError} le fournisseur a refusé un envoi (journalisé).
 */
@CommandHandler(ResendInvoiceNoticeCommand)
export class ResendInvoiceNoticeHandler implements ICommandHandler<
  ResendInvoiceNoticeCommand,
  void
> {
  constructor(
    private readonly invoices: InvoiceReader,
    private readonly documents: InvoiceDocumentRenderer,
    private readonly sender: InvoiceNoticeSender,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ResendInvoiceNoticeCommand): Promise<void> {
    return this.intents.run(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "accounting.resend-invoice-notice",
        subject: command.invoiceId,
      },
      NOTHING_TO_REPLAY,
      () => this.resend(command),
    );
  }

  private async resend(command: ResendInvoiceNoticeCommand): Promise<void> {
    const invoice = await this.invoices.byId(command.invoiceId);
    if (invoice === null) {
      throw new InvoiceNotFoundError(command.invoiceId);
    }
    const number = invoice.toState().number;
    if (invoice.isCreditNote) {
      throw new InvoiceNoticeNotForCreditNoteError(number);
    }
    const document = await this.documents.ensure(invoice.id);
    const outcome = await this.sender.resend(invoice.id, document, command.intentKey);
    if (outcome === null) {
      throw new InvoiceNotFoundError(command.invoiceId);
    }
    if (outcome.recipients.length === 0) {
      throw new InvoiceNoticeNobodyToNotifyError(number);
    }
    if (outcome.failure !== null) {
      throw new InvoiceNoticeResendRefusedError(number, outcome.failure);
    }
  }
}
