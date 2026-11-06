import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailSectionOrderRepository } from "../../domain/ports/mail-section-order.repository.js";
import { MailCopyManifest } from "../../domain/mail-copy-manifest.js";
import { SaveMailSectionOrderDraftCommand } from "./save-mail-section-order-draft.command.js";

/**
 * Pose l'ordre des sections d'un e-mail en brouillon (plan
 * `plan-textes-des-e-mails.md`, E4, S2 et S3).
 *
 * @sans-journal comme le brouillon d'un texte : rien ne change dans les
 * e-mails avant « Publier », dont le fait porte l'ordre avant et après.
 */
@CommandHandler(SaveMailSectionOrderDraftCommand)
export class SaveMailSectionOrderDraftHandler implements ICommandHandler<
  SaveMailSectionOrderDraftCommand,
  void
> {
  constructor(
    private readonly orders: MailSectionOrderRepository,
    private readonly manifest: MailCopyManifest,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {MailSectionOrderChangedError} quelqu'un a déplacé ces sections depuis la lecture.
   * @throws {UnknownMailError} l'e-mail ne déclare pas de sections.
   * @throws {InvalidMailSectionOrderError} section oubliée, doublée, inconnue, ou un cadre.
   */
  async execute(command: SaveMailSectionOrderDraftCommand): Promise<void> {
    await this.uow.run(async () => {
      const order = await this.orders.load(command.mail);
      order.draft(command.order, this.manifest, command.expectedRevision, {
        at: this.clock.now(),
        staffId: command.staffUserId,
      });
      await this.orders.save(order);
    });
  }
}
