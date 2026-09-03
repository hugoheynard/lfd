import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { UpdateDeliveryAddressCommand } from "./address-commands.js";

/**
 * Remplace une adresse de livraison, réservé au gestionnaire de l'entreprise.
 *
 * Le carnet est chargé **pour cette entreprise** : une adresse d'une autre est
 * absente du carnet, donc introuvable — le mur ne dépend plus d'un `where` qu'un
 * appel pourrait oublier.
 */
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

    const book = await this.addresses.loadDeliveryBook(command.companyId);
    book.edit(command.addressId, command.payload);
    await this.addresses.saveDeliveryBook(book);
  }
}
