import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { OpenSupportRequestExistsError } from "../../domain/errors/account-errors.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { SupportRequestRepository } from "../../domain/ports/support-request.repository.js";
import { ensureCompanyMember } from "../../domain/services/company-access.js";
import { RequestActivationSupportCommand } from "./request-activation-support.command.js";

/** Enregistre une demande de support à l'activation, ouverte à tout **membre**. */
@CommandHandler(RequestActivationSupportCommand)
export class RequestActivationSupportHandler implements ICommandHandler<
  RequestActivationSupportCommand,
  string
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly support: SupportRequestRepository,
  ) {}

  async execute(command: RequestActivationSupportCommand): Promise<string> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyMember(role, command.companyId);

    // Une seule demande ouverte à la fois : borne l'écriture, évite les rappels
    // en double.
    if (await this.support.hasOpenRequest(command.companyId)) {
      throw new OpenSupportRequestExistsError(command.companyId);
    }

    return this.support.record(command.companyId, command.actorUserId, command.payload);
  }
}
