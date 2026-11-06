import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailSectionOrderRepository } from "../../domain/ports/mail-section-order.repository.js";
import { ResetMailSectionOrderDraftCommand } from "./reset-mail-section-order-draft.command.js";

/**
 * Pose « rétablir l'ordre d'origine » en brouillon. Les e-mails gardent
 * l'ordre publié jusqu'au prochain « Publier » (E4, S3).
 *
 * @sans-journal comme le rétablissement d'un texte : c'est « Publier » qui
 * change les e-mails, et son fait porte l'ordre retiré.
 */
@CommandHandler(ResetMailSectionOrderDraftCommand)
export class ResetMailSectionOrderDraftHandler implements ICommandHandler<
  ResetMailSectionOrderDraftCommand,
  void
> {
  constructor(
    private readonly orders: MailSectionOrderRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /** @throws {MailSectionOrderChangedError} quelqu'un a déplacé ces sections depuis la lecture. */
  async execute(command: ResetMailSectionOrderDraftCommand): Promise<void> {
    await this.uow.run(async () => {
      const order = await this.orders.load(command.mail);
      order.reset(command.expectedRevision, { at: this.clock.now(), staffId: command.staffUserId });
      await this.orders.save(order);
    });
  }
}
