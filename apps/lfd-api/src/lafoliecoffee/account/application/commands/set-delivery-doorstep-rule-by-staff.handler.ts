import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DeliveryDoorstepRuleSetEvent } from "../../domain/events/delivery-doorstep-rule.event.js";
import { deliveryAddressOf } from "../../domain/events/journal-names.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { SetDeliveryDoorstepRuleByStaffCommand } from "./set-delivery-doorstep-rule-by-staff.command.js";

/**
 * Règle la décision d'avance à la porte d'une adresse (B3 bis), par le carnet.
 *
 * Le carnet est chargé POUR cette société : une adresse d'une autre est
 * introuvable (404). Une valeur inchangée n'écrit rien et ne journalise rien.
 * Une tournée déjà partie garde la règle qu'elle a figée.
 *
 * @throws {CompanyAddressNotFoundError}
 */
@CommandHandler(SetDeliveryDoorstepRuleByStaffCommand)
export class SetDeliveryDoorstepRuleByStaffHandler implements ICommandHandler<
  SetDeliveryDoorstepRuleByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: SetDeliveryDoorstepRuleByStaffCommand): Promise<void> {
    const book = await this.addresses.loadDeliveryBook(command.companyId);
    if (!book.setDoorstepRule(command.addressId, command.rule)) {
      return;
    }
    const company = await this.names.company(command.companyId);
    const address = deliveryAddressOf(book, command.addressId);
    await this.uow.run(async () => {
      await this.addresses.saveDeliveryBook(book);
      await this.events.publishTraced(
        new DeliveryDoorstepRuleSetEvent(company, address, command.rule),
      );
    });
  }
}
