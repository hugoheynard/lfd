import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { RequestPaymentTermCommand } from "./company-settings-commands.js";

/**
 * Enregistre la condition de règlement **demandée** par le client, réservé au
 * gestionnaire. On n'écrit jamais le terme convenu (staff-only) : la demande
 * atterrit dans `requested_payment_term`. Le front n'affiche « en attente » que
 * si la demande diffère du convenu — demander le terme déjà en vigueur est donc
 * un no-op visible.
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

    await this.companies.requestPaymentTerm(command.companyId, command.paymentTerm);
  }
}
