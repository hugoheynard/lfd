import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactUpdatedByStaffEvent } from "../../domain/events/staff-contact-acts.event.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { CompanyContactBook } from "../services/company-contact-book.service.js";
import { UpdateContactByStaffCommand } from "./update-contact-by-staff.command.js";

/** Remplace un interlocuteur additionnel et son rôle, à la place du client. */
@CommandHandler(UpdateContactByStaffCommand)
export class UpdateContactByStaffHandler implements ICommandHandler<
  UpdateContactByStaffCommand,
  void
> {
  constructor(
    private readonly book: CompanyContactBook,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateContactByStaffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.book.replace(
        command.companyId,
        command.contactId,
        ContactDetails.create(command.details),
        command.role,
      );
      await this.events.publishTraced(
        new ContactUpdatedByStaffEvent(command.companyId, command.contactId, command.role),
      );
    });
  }
}
