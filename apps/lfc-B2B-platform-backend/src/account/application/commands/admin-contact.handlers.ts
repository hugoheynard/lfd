import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyContactRepository } from "../../domain/ports/company-contact.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
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
  constructor(private readonly companies: CompanyRepository) {}

  async execute(command: UpdatePrimaryContactByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.changePrimaryContact(ContactDetails.create(command.details));
    await this.companies.save(company);
  }
}

/** Ajoute un interlocuteur **additionnel** — un carnet d'adresses, pas un accès. */
@CommandHandler(AddContactByStaffCommand)
export class AddContactByStaffHandler implements ICommandHandler<AddContactByStaffCommand, string> {
  constructor(private readonly contacts: CompanyContactRepository) {}

  async execute(command: AddContactByStaffCommand): Promise<string> {
    return await this.contacts.add(command.companyId, ContactDetails.create(command.details));
  }
}

@CommandHandler(UpdateContactByStaffCommand)
export class UpdateContactByStaffHandler implements ICommandHandler<
  UpdateContactByStaffCommand,
  void
> {
  constructor(private readonly contacts: CompanyContactRepository) {}

  async execute(command: UpdateContactByStaffCommand): Promise<void> {
    await this.contacts.update(
      command.companyId,
      command.contactId,
      ContactDetails.create(command.details),
    );
  }
}

@CommandHandler(RemoveContactByStaffCommand)
export class RemoveContactByStaffHandler implements ICommandHandler<
  RemoveContactByStaffCommand,
  void
> {
  constructor(private readonly contacts: CompanyContactRepository) {}

  async execute(command: RemoveContactByStaffCommand): Promise<void> {
    await this.contacts.remove(command.companyId, command.contactId);
  }
}
