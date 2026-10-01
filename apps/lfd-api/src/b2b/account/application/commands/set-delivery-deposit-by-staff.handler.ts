import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DeliveryDepositSetEvent } from "../../domain/events/delivery-deposit.event.js";
import { deliveryAddressOf } from "../../domain/events/journal-names.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { SetDeliveryDepositByStaffCommand } from "./set-delivery-deposit-by-staff.command.js";

/**
 * Règle « dépôt autorisé » sur une adresse, à la place du client (AP-D5).
 *
 * Le carnet est chargé POUR cette société : une adresse d'une autre est
 * introuvable (404). Une valeur inchangée n'écrit rien et ne journalise rien.
 *
 * @throws {CompanyAddressNotFoundError}
 */
@CommandHandler(SetDeliveryDepositByStaffCommand)
export class SetDeliveryDepositByStaffHandler implements ICommandHandler<
  SetDeliveryDepositByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: SetDeliveryDepositByStaffCommand): Promise<void> {
    const book = await this.addresses.loadDeliveryBook(command.companyId);
    if (!book.allowDeposit(command.addressId, command.depositAllowed)) {
      return;
    }
    const company = await this.names.company(command.companyId);
    const address = deliveryAddressOf(book, command.addressId);
    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.events.publishTraced(
        new DeliveryDepositSetEvent(company, address, command.depositAllowed),
      );
    });
  }
}
