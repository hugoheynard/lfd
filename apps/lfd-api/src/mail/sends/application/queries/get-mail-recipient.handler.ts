import type { MailRecipientView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { isRevealCurrent, revealedUntil } from "../../domain/entities/staff-mail-consultations.js";
import {
  MailRecipientNotRevealedError,
  MailSendNotFoundError,
} from "../../domain/errors/mail-sends.errors.js";
import { MailRecipientReader } from "../../domain/ports/mail-recipient.reader.js";
import { MailRevealLedger } from "../../domain/ports/mail-reveal.ledger.js";
import { GetMailRecipientQuery } from "./get-mail-recipient.query.js";

/**
 * Lit la révélation dans la table du bloc (pas dans le journal des faits),
 * puis l'adresse. L'ordre compte : sans révélation en cours, l'adresse n'est
 * même pas lue.
 */
@QueryHandler(GetMailRecipientQuery)
export class GetMailRecipientHandler implements IQueryHandler<
  GetMailRecipientQuery,
  MailRecipientView
> {
  constructor(
    private readonly reveals: MailRevealLedger,
    private readonly recipients: MailRecipientReader,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {MailRecipientNotRevealedError} pas de révélation de cette personne depuis moins de 5 minutes.
   * @throws {MailSendNotFoundError} l'envoi n'est plus au suivi.
   */
  async execute({ sendId, staffUserId }: GetMailRecipientQuery): Promise<MailRecipientView> {
    const revealedAt = await this.reveals.lastRevealedAt(staffUserId, sendId);
    if (revealedAt === null || !isRevealCurrent(revealedAt, this.clock.now())) {
      throw new MailRecipientNotRevealedError(sendId);
    }
    const found = await this.recipients.recipientOf(sendId);
    if (found === null) {
      throw new MailSendNotFoundError(sendId);
    }
    return {
      id: sendId,
      recipient: found.recipient,
      failureReason: found.failureReason,
      revealedUntil: revealedUntil(revealedAt).toISOString(),
    };
  }
}
