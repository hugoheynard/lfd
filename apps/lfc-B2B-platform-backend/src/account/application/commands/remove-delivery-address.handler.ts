import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { RemoveDeliveryAddressCommand } from "./address-commands.js";

/** Archive une adresse de livraison, réservé au gestionnaire de l'entreprise. */
@CommandHandler(RemoveDeliveryAddressCommand)
export class RemoveDeliveryAddressHandler implements ICommandHandler<
  RemoveDeliveryAddressCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
  ) {}

  async execute(command: RemoveDeliveryAddressCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.addresses.archiveDelivery(command.companyId, command.addressId);
  }
}
