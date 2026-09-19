import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactRemovedByStaffEvent } from "../../domain/events/staff-contact-acts.event.js";
import { CompanyContactRepository } from "../../domain/ports/company-contact.repository.js";
import { RemoveContactByStaffCommand } from "./remove-contact-by-staff.command.js";

/** Retire un interlocuteur additionnel, à la place du client. */
@CommandHandler(RemoveContactByStaffCommand)
export class RemoveContactByStaffHandler implements ICommandHandler<
  RemoveContactByStaffCommand,
  void
> {
  constructor(
    private readonly contacts: CompanyContactRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveContactByStaffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.contacts.remove(command.companyId, command.contactId);
      await this.events.publishTraced(
        new ContactRemovedByStaffEvent(command.companyId, command.contactId),
      );
    });
  }
}
