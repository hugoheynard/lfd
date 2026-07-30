import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { UpdateCompanyIdentityCommand } from "./company-settings-commands.js";

/** Édite l'identité souple (enseigne + TVA), réservé au gestionnaire. */
@CommandHandler(UpdateCompanyIdentityCommand)
export class UpdateCompanyIdentityHandler implements ICommandHandler<
  UpdateCompanyIdentityCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
  ) {}

  async execute(command: UpdateCompanyIdentityCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.companies.updateIdentity(command.companyId, {
      enseigne: command.payload.enseigne.trim(),
      tvaIntracom: command.payload.tvaIntracom.trim(),
    });
  }
}
