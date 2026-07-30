import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { UpdatePrimaryContactCommand } from "./contact-commands.js";

/** Édite le contact principal d'une entreprise, réservé à son gestionnaire. */
@CommandHandler(UpdatePrimaryContactCommand)
export class UpdatePrimaryContactHandler implements ICommandHandler<
  UpdatePrimaryContactCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
  ) {}

  async execute(command: UpdatePrimaryContactCommand): Promise<void> {
    // Le mur d'abord : on ne construit rien, on ne touche à rien tant que le
    // droit d'agir sur CETTE entreprise n'est pas prouvé.
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.companies.updatePrimaryContact(
      command.companyId,
      ContactDetails.create(command.details),
    );
  }
}
