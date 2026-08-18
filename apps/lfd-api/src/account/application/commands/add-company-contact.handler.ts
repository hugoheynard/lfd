import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyContactBook } from "../services/company-contact-book.service.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { AddCompanyContactCommand } from "./contact-commands.js";

/** Ajoute un contact additionnel à une entreprise, réservé à son gestionnaire. */
@CommandHandler(AddCompanyContactCommand)
export class AddCompanyContactHandler implements ICommandHandler<AddCompanyContactCommand, string> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly book: CompanyContactBook,
  ) {}

  async execute(command: AddCompanyContactCommand): Promise<string> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    return this.book.add(command.companyId, ContactDetails.create(command.details), command.role);
  }
}
