import type { AdminShortfallLetterDraft } from "@lfd/contracts";
import { Logger, Optional } from "@nestjs/common";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import {
  NO_MAIL_COPY_OVERLAY,
  withMailCopyOverlay,
  type MailCopyOverlay,
} from "../../../../platform/mailer/copy/mail-copy-overlay.js";
import { PublishedMailCopyReader } from "../../../../platform/mailer/effective-copy/published-mail-copy.reader.js";
import { draftOrderShortfallMessage } from "../../../../platform/mailer/order-shortfall-mail.js";
import {
  ShortfallCustomerAlreadyNotifiedError,
  ShortfallLetterWithoutDecisionError,
} from "../../domain/errors/shortfall-letter-errors.js";
import { ShortfallLetterReader } from "../../domain/ports/shortfall-letter.reader.js";
import { shortfallLetterLines } from "../../domain/services/shortfall-letter-lines.js";
import { GetShortfallLetterDraftQuery } from "./get-shortfall-letter-draft.query.js";

/**
 * Rédige la proposition que l'équipe relit avant d'écrire au client (lot E6d) :
 * ce qui part, ce qui manque, la suite — par le dictionnaire des e-mails, dans
 * la langue de la commande (le français pour une commande sans langue).
 *
 * Les textes PUBLIÉS à l'écran des textes s'appliquent, comme à l'envoi ; une
 * lecture du publié qui échoue rend la proposition du code, et le dit au
 * journal de l'API.
 *
 * @throws {ShortfallLetterWithoutDecisionError} commande inconnue, ou départ non décidé.
 * @throws {ShortfallCustomerAlreadyNotifiedError} le client a déjà été prévenu.
 */
@QueryHandler(GetShortfallLetterDraftQuery)
export class GetShortfallLetterDraftHandler implements IQueryHandler<
  GetShortfallLetterDraftQuery,
  AdminShortfallLetterDraft
> {
  private readonly logger = new Logger(GetShortfallLetterDraftHandler.name);

  constructor(
    private readonly letters: ShortfallLetterReader,
    @Optional() private readonly published: PublishedMailCopyReader | null = null,
  ) {}

  async execute(query: GetShortfallLetterDraftQuery): Promise<AdminShortfallLetterDraft> {
    const subject = await this.letters.subjectOf(query.orderId);
    if (subject === null) {
      throw new ShortfallLetterWithoutDecisionError(query.orderId);
    }
    if (subject.notified) {
      throw new ShortfallCustomerAlreadyNotifiedError(subject.reference);
    }
    const lines = shortfallLetterLines(subject.lines, subject.names);
    const overlay = await this.publishedTexts();
    const message = withMailCopyOverlay(overlay, () =>
      draftOrderShortfallMessage({
        reference: subject.reference,
        ...lines,
        locale: subject.locale ?? DEFAULT_MAIL_LOCALE,
      }),
    );
    return { message };
  }

  private async publishedTexts(): Promise<MailCopyOverlay> {
    if (this.published === null) {
      return NO_MAIL_COPY_OVERLAY;
    }
    try {
      return await this.published.read();
    } catch (error: unknown) {
      this.logger.warn(
        `Textes d'e-mails publiés illisibles : la proposition « Écrire au client » suit le texte du code. Cause : ${String(error)}`,
      );
      return NO_MAIL_COPY_OVERLAY;
    }
  }
}
