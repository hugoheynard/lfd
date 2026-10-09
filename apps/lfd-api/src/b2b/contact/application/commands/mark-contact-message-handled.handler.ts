import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { ContactMessageHandledEvent } from "../../domain/contact-message.events.js";
import { ContactMessageNotFoundError } from "../../domain/errors/contact-errors.js";
import { ContactMessageRepository } from "../../domain/ports/contact-message.repository.js";
import { MarkContactMessageHandledCommand } from "./mark-contact-message-handled.command.js";

/**
 * Marque un message traité : charger, `markHandled` (qui refuse un second
 * traitement), enregistrer — et le fait part avec l'écriture, dans la même
 * transaction.
 */
@CommandHandler(MarkContactMessageHandledCommand)
export class MarkContactMessageHandledHandler implements ICommandHandler<
  MarkContactMessageHandledCommand,
  void
> {
  constructor(
    private readonly messages: ContactMessageRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MarkContactMessageHandledCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const message = await this.messages.load(command.messageId);
      if (message === null) {
        throw new ContactMessageNotFoundError(command.messageId);
      }
      message.markHandled(author, this.clock.now());
      await this.messages.save(message);
      await this.events.publishTraced(new ContactMessageHandledEvent(message));
    });
  }
}
