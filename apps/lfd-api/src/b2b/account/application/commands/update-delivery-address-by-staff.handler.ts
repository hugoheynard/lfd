import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DeliveryAddressUpdatedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { UpdateDeliveryAddressByStaffCommand } from "./update-delivery-address-by-staff.command.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { deliveryAddressOf } from "../../domain/events/journal-names.js";

/**
 * Corrige une adresse de livraison, à la place du client.
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
@CommandHandler(UpdateDeliveryAddressByStaffCommand)
export class UpdateDeliveryAddressByStaffHandler implements ICommandHandler<
  UpdateDeliveryAddressByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: UpdateDeliveryAddressByStaffCommand): Promise<void> {
    const book = await this.addresses.loadDeliveryBook(command.companyId);
    book.edit(command.addressId, command.payload);
    const company = await this.names.company(command.companyId);
    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.events.publishTraced(
        new DeliveryAddressUpdatedByStaffEvent(
          company,
          deliveryAddressOf(book, command.addressId),
          command.payload,
        ),
      );
    });
  }
}
