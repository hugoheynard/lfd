import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { BillingAddressSavedByStaffEvent } from "../../domain/events/staff-address-acts.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { SaveBillingAddressByStaffCommand } from "./save-billing-address-by-staff.command.js";

/**
 * Geste du staff sur les **adresses** d'un client : l'adresse de facturation.
 *
 * Il partage avec les autres gestes d'adresse staff un dépôt, un mur (le
 * rattachement à la société) et une famille de faits (`staff-address-acts`).
 */
@CommandHandler(SaveBillingAddressByStaffCommand)
export class SaveBillingAddressByStaffHandler implements ICommandHandler<
  SaveBillingAddressByStaffCommand,
  void
> {
  constructor(
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SaveBillingAddressByStaffCommand): Promise<void> {
    await this.uow.run(async () => {
      await this.addresses.saveBilling(command.companyId, command.payload);
      await this.events.publishTraced(
        new BillingAddressSavedByStaffEvent(command.companyId, command.payload),
      );
    });
    // Pièce « facturation » franchie : fait d'ENTONNOIR, best-effort et hors
    // transaction — le perdre fausse une statistique, pas une responsabilité.
    this.events.publish(new CompanyStepReachedEvent(command.companyId, "billing"));
  }
}
