import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactAddedByStaffEvent } from "../../domain/events/staff-contact-acts.event.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { CompanyContactBook } from "../services/company-contact-book.service.js";
import { AddContactByStaffCommand } from "./add-contact-by-staff.command.js";

/** Ajoute un interlocuteur **additionnel** — un carnet d'adresses, pas un accès. */
@CommandHandler(AddContactByStaffCommand)
export class AddContactByStaffHandler implements ICommandHandler<AddContactByStaffCommand, string> {
  constructor(
    private readonly book: CompanyContactBook,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AddContactByStaffCommand): Promise<string> {
    return await this.uow.run(async () => {
      const contactId = await this.book.add(
        command.companyId,
        ContactDetails.create(command.details),
        command.role,
      );
      await this.events.publishTraced(
        new ContactAddedByStaffEvent(command.companyId, contactId, command.role),
      );
      return contactId;
    });
  }
}
