import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { UpdatePaymentTermCommand } from "./company-settings-commands.js";

/** Enregistre la condition de règlement souhaitée, réservé au gestionnaire. */
@CommandHandler(UpdatePaymentTermCommand)
export class UpdatePaymentTermHandler implements ICommandHandler<UpdatePaymentTermCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
  ) {}

  async execute(command: UpdatePaymentTermCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.companies.updatePaymentTerm(command.companyId, command.paymentTerm);
  }
}
