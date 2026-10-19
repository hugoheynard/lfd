import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineNoticeReader } from "../../domain/ports/vitrine-notice.reader.js";
import { VitrineNoticeRepository } from "../../domain/ports/vitrine-notice.repository.js";
import { VitrineNotice } from "../../domain/vitrine-notice.js";
import { selectVitrineNoticeAddressees } from "../../domain/vitrine-notice-audience.js";
import { VitrineNoticeText } from "../../domain/vitrine-notice-text.js";
import { VitrineNoticeDispatcher } from "../services/vitrine-notice-dispatcher.js";
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
 *    (dédoublonnée chez Resend), puis son issue est consignée
 *    ({@link VitrineNoticeDispatcher}). Interrompu, l'envoi se reprend par
 *    « Reprendre l'envoi » (`ResumeVitrineNoticeHandler`).
 *
 * `@hors-transaction` les e-mails partent chez un tiers et ne se rattrapent
 * pas ; chaque issue est consignée dès qu'elle est connue.
 * `@sans-journal` l'annonce EST le journal (`vitrine_notices`, son auteur,
 * ses destinataires) : un fait de plus le recopierait.
 */
@CommandHandler(SendVitrineNoticeCommand)
export class SendVitrineNoticeHandler implements ICommandHandler<SendVitrineNoticeCommand, string> {
  constructor(
    private readonly notices: VitrineNoticeRepository,
    private readonly reader: VitrineNoticeReader,
    private readonly dispatcher: VitrineNoticeDispatcher,
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
    await this.dispatcher.dispatch(notice, notice.unattempted);
    return notice.id;
  }
}
