import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import {
  ContactAddedByStaffEvent,
  ContactRemovedByStaffEvent,
  ContactUpdatedByStaffEvent,
  PrimaryContactChangedByStaffEvent,
} from "../../domain/events/staff-contact-acts.event.js";
import { CompanyContactRepository } from "../../domain/ports/company-contact.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { CompanyContactBook } from "../services/company-contact-book.service.js";
import {
  AddContactByStaffCommand,
  RemoveContactByStaffCommand,
  UpdateContactByStaffCommand,
  UpdatePrimaryContactByStaffCommand,
} from "./admin-contact-commands.js";

/**
 * Le **détenteur** de la société, édité par le staff.
 *
 * Il vit aplati sur l'agrégat (ce n'est pas un `CompanyContact`), d'où le
 * passage par `changePrimaryContact` plutôt que par le dépôt de contacts.
 */
@CommandHandler(UpdatePrimaryContactByStaffCommand)
export class UpdatePrimaryContactByStaffHandler implements ICommandHandler<
  UpdatePrimaryContactByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdatePrimaryContactByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.changePrimaryContact(ContactDetails.create(command.details));
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(new PrimaryContactChangedByStaffEvent(command.companyId));
    });
  }
}

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
