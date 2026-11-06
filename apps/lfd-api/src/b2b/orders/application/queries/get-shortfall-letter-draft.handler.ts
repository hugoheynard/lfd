import type { AdminShortfallLetterDraft } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import { ShortfallLetterDrafter } from "../../../../mail/channels/templates/shortfall-letter-drafter.js";
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
 * Les textes PUBLIÉS à l'écran des textes s'appliquent, comme à l'envoi : la
 * rédaction est celle du bloc `mail`, par son canal (`ShortfallLetterDrafter`,
 * lot S3b), qui se replie sur le texte du code quand le publié est illisible.
 *
 * @throws {ShortfallLetterWithoutDecisionError} commande inconnue, ou départ non décidé.
 * @throws {ShortfallCustomerAlreadyNotifiedError} le client a déjà été prévenu.
 */
@QueryHandler(GetShortfallLetterDraftQuery)
export class GetShortfallLetterDraftHandler implements IQueryHandler<
  GetShortfallLetterDraftQuery,
  AdminShortfallLetterDraft
> {
  constructor(
    private readonly letters: ShortfallLetterReader,
    private readonly drafter: ShortfallLetterDrafter,
  ) {}

  async execute(query: GetShortfallLetterDraftQuery): Promise<AdminShortfallLetterDraft> {
    const subject = await this.letters.subjectOf(query.orderId);
    if (subject === null) {
      throw new ShortfallLetterWithoutDecisionError(query.orderId);
    }
    if (subject.notified) {
      throw new ShortfallCustomerAlreadyNotifiedError(subject.reference);
    }
    const lines = shortfallLetterLines(subject.lines, subject.names, subject.units);
    const message = await this.drafter.draft({
      reference: subject.reference,
      ...lines,
      locale: subject.locale ?? DEFAULT_MAIL_LOCALE,
    });
    return { message };
  }
}
