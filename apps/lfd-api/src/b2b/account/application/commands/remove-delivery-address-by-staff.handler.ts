import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { DeliveryAddressRemovedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { RemoveDeliveryAddressByStaffCommand } from "./remove-delivery-address-by-staff.command.js";

/**
 * Archive une adresse de livraison, à la place du client.
 *
 * Geste staff sur une adresse de livraison **déjà posée** — la corriger, la
 * désigner par défaut, l'archiver.
 *
 * Aucun mur membership — l'auth staff garde la route, comme pour les autres
 * pièces. Le mur qui reste est celui du **rattachement** : chaque méthode du
 * port porte le `companyId`, et l'implémentation filtre sur (`id` ET
 * `companyId`). Une adresse d'une autre société n'est donc pas touchée, elle est
 * déclarée introuvable.
 */
@CommandHandler(RemoveDeliveryAddressByStaffCommand)
export class RemoveDeliveryAddressByStaffHandler implements ICommandHandler<
  RemoveDeliveryAddressByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveDeliveryAddressByStaffCommand): Promise<void> {
    const book = await this.addresses.loadDeliveryBook(command.companyId);
    book.archive(command.addressId, this.clock.now());

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    // Jumeau du geste client : une préférence qui désignait l'archivée retombe
    // sur « le défaut du moment », que le carnet vient de recalculer.
    const orphaned = company.fulfillmentPreference.deliveryAddressId === command.addressId;
    if (orphaned) {
      company.preferFulfillment({ ...company.fulfillmentPreference, deliveryAddressId: null });
    }

    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      if (orphaned) {
        await this.companies.save(company);
      }
      await this.events.publishTraced(
        new DeliveryAddressRemovedByStaffEvent(command.companyId, command.addressId),
      );
    });
  }
}
