import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DefaultDeliverySetByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { SetDefaultDeliveryByStaffCommand } from "./set-default-delivery-by-staff.command.js";

/**
 * Désigne l'adresse de livraison par défaut, à la place du client.
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
@CommandHandler(SetDefaultDeliveryByStaffCommand)
export class SetDefaultDeliveryByStaffHandler implements ICommandHandler<
  SetDefaultDeliveryByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetDefaultDeliveryByStaffCommand): Promise<void> {
    const book = await this.addresses.loadDeliveryBook(command.companyId);
    book.makeDefault(command.addressId);
    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.events.publishTraced(
        new DefaultDeliverySetByStaffEvent(command.companyId, command.addressId),
      );
    });
  }
}
