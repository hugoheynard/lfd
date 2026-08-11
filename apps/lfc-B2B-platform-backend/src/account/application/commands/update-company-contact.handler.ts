import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyContactRepository } from "../../domain/ports/company-contact.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { UpdateCompanyContactCommand } from "./contact-commands.js";

/** Remplace un contact additionnel, réservé au gestionnaire de l'entreprise. */
@CommandHandler(UpdateCompanyContactCommand)
export class UpdateCompanyContactHandler implements ICommandHandler<
  UpdateCompanyContactCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly contacts: CompanyContactRepository,
  ) {}

  async execute(command: UpdateCompanyContactCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    // Le repository filtre sur (id ET companyId) : un contact d'une autre
    // entreprise est traité comme absent, jamais modifié.
    await this.contacts.update(
      command.companyId,
      command.contactId,
      ContactDetails.create(command.details),
      command.role,
    );
  }
}
