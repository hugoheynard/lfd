import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { DeliveryAddressAddedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { AddDeliveryAddressByStaffCommand } from "./add-delivery-address-by-staff.command.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { deliveryAddressOf } from "../../domain/events/journal-names.js";

/**
 * Geste du staff sur les **adresses** d'un client : une adresse de livraison de
 * plus.
 *
 * Il partage avec les autres gestes d'adresse staff un dépôt, un mur (le
 * rattachement à la société) et une famille de faits (`staff-address-acts`).
 */
@CommandHandler(AddDeliveryAddressByStaffCommand)
export class AddDeliveryAddressByStaffHandler implements ICommandHandler<
  AddDeliveryAddressByStaffCommand,
  string
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: AddDeliveryAddressByStaffCommand): Promise<string> {
    const book = await this.addresses.loadDeliveryBook(command.companyId);
    const created = this.ids.next();
    book.add(created, command.payload, this.clock.now());
    const company = await this.names.company(command.companyId);
    const addressId = await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.events.publishTraced(
        new DeliveryAddressAddedByStaffEvent(
          company,
          deliveryAddressOf(book, created),
          command.payload,
        ),
      );
      return created;
    });
    // Pièce « livraison » franchie : fait d'entonnoir, best-effort.
    this.events.publish(new CompanyStepReachedEvent(company.id, company.name, "delivery"));
    return addressId;
  }
}
