import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactRemovedByStaffEvent } from "../../domain/events/staff-contact-acts.event.js";
import { CompanyContactRepository } from "../../domain/ports/company-contact.repository.js";
import { RemoveContactByStaffCommand } from "./remove-contact-by-staff.command.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";

/** Retire un interlocuteur additionnel, à la place du client. */
@CommandHandler(RemoveContactByStaffCommand)
export class RemoveContactByStaffHandler implements ICommandHandler<
  RemoveContactByStaffCommand,
  void
> {
  constructor(
    private readonly contacts: CompanyContactRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: RemoveContactByStaffCommand): Promise<void> {
    const company = await this.names.company(command.companyId);
    await this.uow.run(async () => {
      await this.contacts.remove(command.companyId, command.contactId);
      await this.events.publishTraced(
        // Le retrait ne relit pas la fiche qu'il efface : l'id seul, le fait
        // d'ajout — toujours au journal — dit qui c'était.
        new ContactRemovedByStaffEvent(company, { id: command.contactId }),
      );
    });
  }
}
