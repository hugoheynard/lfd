import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineNoticeReader } from "../../domain/ports/vitrine-notice.reader.js";
import { VitrineNoticeRepository } from "../../domain/ports/vitrine-notice.repository.js";
import { VitrineNotice } from "../../domain/vitrine-notice.js";
import { selectVitrineNoticeAddressees } from "../../domain/vitrine-notice-audience.js";
import { VitrineNoticeText } from "../../domain/vitrine-notice-text.js";
import { SendVitrineNoticeCommand } from "./send-vitrine-notice.command.js";

/**
 * **Envoie une annonce aux contacts des abonnés**, un e-mail par adresse —
 * jamais les adresses des autres en copie.
 *
 * ## L'ordre, et pourquoi
 *
 * 1. Une clé déjà vue rend l'annonce qu'elle désigne : un double clic ne
 *    renvoie rien.
 * 2. L'annonce est RANGÉE avant tout envoi, destinataires « pas tentés ». Deux
 *    clics simultanés se départagent sur l'unicité de la clé : le second
 *    n'envoie rien et rend l'id du premier.
 * 3. Chaque e-mail part avec la clé `vitrine-notice:<annonce>:<abonné>`
 *    (dédoublonnée chez Resend), puis son issue est consignée.
 *
 * `mailSent` vaut `mailer.enabled` après un envoi accepté (comme l'ouverture
 * d'accès) : à blanc, rien n'est parti et on ne le prétend pas. Un refus du
 * fournisseur est consigné `false` et l'envoi continue pour les autres ; le
 * log porte l'id de l'annonce et de l'abonné, JAMAIS l'adresse.
 *
 * `@hors-transaction` les e-mails partent chez un tiers et ne se rattrapent
 * pas ; chaque issue est consignée dès qu'elle est connue.
 * `@sans-journal` l'annonce EST le journal (`vitrine_notices`, son auteur,
 * ses destinataires) : un fait de plus le recopierait.
 */
@CommandHandler(SendVitrineNoticeCommand)
export class SendVitrineNoticeHandler implements ICommandHandler<SendVitrineNoticeCommand, string> {
  private readonly logger = new Logger(SendVitrineNoticeHandler.name);

  constructor(
    private readonly notices: VitrineNoticeRepository,
    private readonly reader: VitrineNoticeReader,
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: SendVitrineNoticeCommand): Promise<string> {
    const known = await this.notices.idOfKey(command.idempotencyKey);
    if (known !== null) {
      return known;
    }
    const notice = VitrineNotice.compose({
      id: this.ids.next(),
      authorStaffId: command.authorStaffId,
      text: VitrineNoticeText.of(command.subject, command.message),
      idempotencyKey: command.idempotencyKey,
      addressees: selectVitrineNoticeAddressees(
        await this.reader.candidates(),
        command.subscriberIds,
      ),
      at: this.clock.now(),
    });
    const opening = await this.notices.open(notice);
    if (!opening.opened) {
      return opening.existingId;
    }
    for (const recipient of notice.unattempted) {
      const mailSent = await this.deliver(notice, recipient.subscriberId, recipient.contactEmail);
      notice.recordAttempt(recipient.subscriberId, mailSent, this.clock.now());
      await this.notices.save(notice);
    }
    return notice.id;
  }

  private async deliver(notice: VitrineNotice, subscriberId: string, to: string): Promise<boolean> {
    try {
      await this.mailer.send({
        to,
        template: "agency.vitrine-notice",
        data: { subject: notice.text.subject, message: notice.text.message },
        idempotencyKey: `vitrine-notice:${notice.id}:${subscriberId}`,
      });
      return this.mailer.enabled;
    } catch (error) {
      this.logger.error(
        `Annonce ${notice.id} non acceptée pour l'abonné ${subscriberId} : consignée « non envoyée ».`,
        error,
      );
      return false;
    }
  }
}
