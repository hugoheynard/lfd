import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { PrimaryContactChangedByStaffEvent } from "../../domain/events/staff-contact-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { UpdatePrimaryContactByStaffCommand } from "./update-primary-contact-by-staff.command.js";

/**
 * Le **détenteur** de la société, édité par le staff.
 *
 * Il vit aplati sur l'agrégat (ce n'est pas un `CompanyContact`), d'où le
 * passage par `changePrimaryContact` plutôt que par le dépôt de contacts.
 */
@CommandHandler(UpdatePrimaryContactByStaffCommand)
export class UpdatePrimaryContactByStaffHandler implements ICommandHandler<
  UpdatePrimaryContactByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdatePrimaryContactByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.changePrimaryContact(ContactDetails.create(command.details));
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(new PrimaryContactChangedByStaffEvent(command.companyId));
    });
  }
}
