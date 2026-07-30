import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { SetDefaultDeliveryAddressCommand } from "./address-commands.js";

/** Désigne l'adresse de livraison par défaut, réservé au gestionnaire. */
@CommandHandler(SetDefaultDeliveryAddressCommand)
export class SetDefaultDeliveryAddressHandler implements ICommandHandler<
  SetDefaultDeliveryAddressCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
  ) {}

  async execute(command: SetDefaultDeliveryAddressCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.addresses.setDefaultDelivery(command.companyId, command.addressId);
  }
}
