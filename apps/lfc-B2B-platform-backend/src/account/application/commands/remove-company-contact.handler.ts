import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyContactRepository } from "../../domain/ports/company-contact.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { RemoveCompanyContactCommand } from "./contact-commands.js";

/** Retire un contact additionnel, réservé au gestionnaire de l'entreprise. */
@CommandHandler(RemoveCompanyContactCommand)
export class RemoveCompanyContactHandler implements ICommandHandler<
  RemoveCompanyContactCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly contacts: CompanyContactRepository,
  ) {}

  async execute(command: RemoveCompanyContactCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.contacts.remove(command.companyId, command.contactId);
  }
}
