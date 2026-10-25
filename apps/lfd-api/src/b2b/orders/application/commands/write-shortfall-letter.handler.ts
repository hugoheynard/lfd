import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  ShortfallLetterNoRecipientError,
  ShortfallLetterNotSentError,
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
 * (une fois par décision), puis le courriel — le texte RELU, au client qui a
 * passé la commande, comme les autres courriels de commande. Un envoi refusé
 * par le fournisseur annule la trace : la fiche ne dit jamais « prévenu » pour
 * un courriel qui n'est pas parti. Une validation qui échouerait après
 * l'envoi laisserait la trace absente ; le geste rejoué repart avec la même
 * clé (`order-shortfall:<décision>`), que le fournisseur absorbe.
 *
 * L'adresse n'est jamais écrite au journal de l'API.
 *
 * @throws {ShortfallLetterWithoutDecisionError} @throws {ShortfallLetterNoRecipientError}
 * @throws {ShortfallLetterNotSentError} et les refus de `ShortfallLetter` et de
 * `ShortfallNotice.notify`.
 */
@CommandHandler(WriteShortfallLetterCommand)
export class WriteShortfallLetterHandler implements ICommandHandler<
  WriteShortfallLetterCommand,
  void
> {
  private readonly logger = new Logger(WriteShortfallLetterHandler.name);

  constructor(
    private readonly notices: ShortfallNoticeRepository,
    private readonly recipients: OrderRecipientReader,
    @Inject(MAILER) private readonly mailer: B2bMailer,
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
      try {
        await this.mailer.send({
          to: recipient.email,
          template: "customer.order-shortfall",
          idempotencyKey: notice.letterKey,
          data: {
            reference: notice.reference,
            message: letter.text,
            locale: locked.locale ?? DEFAULT_MAIL_LOCALE,
          },
        });
      } catch (error: unknown) {
        this.logger.error(
          `Courriel « départ incomplet » non envoyé (${notice.reference}) : rien n'est tracé.`,
          error,
        );
        throw new ShortfallLetterNotSentError(notice.reference, error);
      }
    });
  }
}
