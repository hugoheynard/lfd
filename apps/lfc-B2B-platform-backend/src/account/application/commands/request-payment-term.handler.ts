import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { RequestPaymentTermCommand } from "./company-settings-commands.js";

/**
 * Enregistre la condition de règlement **demandée** par le client, réservé au
 * gestionnaire. Le mur d'abord ; puis l'agrégat arbitre : `requestPaymentTerm`
 * ne touche jamais le terme convenu (staff-only), et demander le terme déjà en
 * vigueur retire la demande (rien « en attente »).
 */
@CommandHandler(RequestPaymentTermCommand)
export class RequestPaymentTermHandler implements ICommandHandler<RequestPaymentTermCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
  ) {}

  async execute(command: RequestPaymentTermCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.requestTerm(command.term);
    await this.companies.save(company);
  }
}
