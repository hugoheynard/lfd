import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { RemoveDeliveryAddressCommand } from "./address-commands.js";

/**
 * Archive une adresse de livraison, réservé au gestionnaire de l'entreprise.
 *
 * **Deux agrégats, un seul geste.** Le carnet promeut lui-même un remplaçant si
 * l'archivée était le défaut ; mais la société porte, de son côté, une
 * **préférence d'acheminement** qui peut désigner cette même adresse. Rien ne la
 * nettoyait : `onDelete: SetNull` ne se déclenche pas sur un archivage, et les
 * trois lectures de `preferredDeliveryAddressId` ne filtrent pas `archivedAt`.
 * L'écran présélectionnait donc une adresse disparue du carnet — sans conséquence
 * sur les envois (une commande **fige** ses lignes postales à la passation), mais
 * suffisant pour qu'un client croie livrer où il ne livre plus.
 *
 * Les deux écritures partent ensemble : une préférence qui survivrait à
 * l'archivage recréerait exactement le trou qu'on ferme.
 */
@CommandHandler(RemoveDeliveryAddressCommand)
export class RemoveDeliveryAddressHandler implements ICommandHandler<
  RemoveDeliveryAddressCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly companies: CompanyRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveDeliveryAddressCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const book = await this.addresses.loadDeliveryBook(command.companyId);
    book.archive(command.addressId, this.clock.now());

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    // `null` ne veut pas dire « aucune livraison » : il veut dire « le défaut du
    // moment » — que le carnet vient précisément de recalculer.
    const orphaned = company.fulfillmentPreference.deliveryAddressId === command.addressId;
    if (orphaned) {
      company.preferFulfillment({ ...company.fulfillmentPreference, deliveryAddressId: null });
    }

    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      if (orphaned) {
        await this.companies.save(company);
      }
    });
  }
}
