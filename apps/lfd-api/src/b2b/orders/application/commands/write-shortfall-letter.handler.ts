import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import { Mail } from "../../../../mail/channels/requests/mail.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  ShortfallLetterNoRecipientError,
  ShortfallLetterWithoutDecisionError,
} from "../../domain/errors/shortfall-letter-errors.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { ShortfallNoticeRepository } from "../../domain/ports/shortfall-notice.repository.js";
import { ShortfallLetter } from "../../domain/value-objects/shortfall-letter.js";
import { WriteShortfallLetterCommand } from "./write-shortfall-letter.command.js";

/**
 * **« Écrire au client »** (lot E6d, plan
 * plan E6d (`documentation/commandes/bon-de-livraison.md`)) — un geste à part,
 * jamais un abonné : avertir le client est un choix du décideur.
 *
 * Une transaction : la décision verrouillée, l'envoi tracé par l'agrégat
 * (une fois par décision), et le courriel DEMANDÉ au bloc `mail` — le texte
 * RELU, au client qui a passé la commande, comme les autres courriels de
 * commande. La trace et la demande tombent ensemble : une validation annulée
 * n'envoie rien, une validation réussie fait partir le courriel ensuite, même
 * après un redémarrage (plan `plan-service-e-mails.md`, S2a).
 *
 * ⚠️ « Prévenu » dit depuis S2a « le courriel est demandé », plus « le
 * fournisseur l'a accepté » : l'envoi se fait après la validation, et son
 * issue se lit au suivi des e-mails (clé `order-shortfall:<décision>`).
 *
 * L'adresse n'est jamais écrite au journal de l'API.
 *
 * @throws {ShortfallLetterWithoutDecisionError} @throws {ShortfallLetterNoRecipientError}
 * et les refus de `ShortfallLetter` et de `ShortfallNotice.notify`.
 */
@CommandHandler(WriteShortfallLetterCommand)
export class WriteShortfallLetterHandler implements ICommandHandler<
  WriteShortfallLetterCommand,
  void
> {
  constructor(
    private readonly notices: ShortfallNoticeRepository,
    private readonly recipients: OrderRecipientReader,
    private readonly mail: Mail,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: WriteShortfallLetterCommand): Promise<void> {
    const letter = ShortfallLetter.of(command.message);
    await this.uow.run(async () => {
      const locked = await this.notices.lock(command.orderId);
      if (locked === null) {
        throw new ShortfallLetterWithoutDecisionError(command.orderId);
      }
      const { notice } = locked;
      notice.notify(this.clock.now(), command.staffUserId);
      await this.notices.save(notice);
      const recipient = await this.recipients.findById(locked.placedByUserId);
      if (recipient === null) {
        throw new ShortfallLetterNoRecipientError(notice.reference);
      }
      await this.mail.send({
        brand: "lfc",
        to: recipient.email,
        template: "customer.order-shortfall",
        idempotencyKey: notice.letterKey,
        data: {
          reference: notice.reference,
          message: letter.text,
          locale: locked.locale ?? DEFAULT_MAIL_LOCALE,
        },
      });
    });
  }
}
