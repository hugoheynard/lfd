import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { UpdateDeliveryAddressCommand } from "./address-commands.js";

/** Remplace une adresse de livraison, réservé au gestionnaire de l'entreprise. */
@CommandHandler(UpdateDeliveryAddressCommand)
export class UpdateDeliveryAddressHandler implements ICommandHandler<
  UpdateDeliveryAddressCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
  ) {}

  async execute(command: UpdateDeliveryAddressCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    // Le repository filtre sur (id ET companyId) : une adresse d'une autre
    // entreprise est traitée comme absente, jamais modifiée.
    await this.addresses.updateDelivery(command.companyId, command.addressId, command.payload);
  }
}
