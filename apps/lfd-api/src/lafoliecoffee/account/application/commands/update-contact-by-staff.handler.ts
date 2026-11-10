import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactUpdatedByStaffEvent } from "../../domain/events/staff-contact-acts.event.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { CompanyContactBook } from "../services/company-contact-book.service.js";
import { UpdateContactByStaffCommand } from "./update-contact-by-staff.command.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { contactRef } from "../../domain/events/journal-names.js";
import { CONTACT_UPDATED } from "../../domain/events/site-gesture.fact.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";

/** Remplace un interlocuteur additionnel et son rôle, à la place du client. */
@CommandHandler(UpdateContactByStaffCommand)
export class UpdateContactByStaffHandler implements ICommandHandler<
  UpdateContactByStaffCommand,
  void
> {
  constructor(
    private readonly book: CompanyContactBook,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
    private readonly gestures: SiteGesturePublisher,
  ) {}

  async execute(command: UpdateContactByStaffCommand): Promise<void> {
    const details = ContactDetails.create(command.details);
    const company = await this.names.company(command.companyId);
    await this.uow.run(async () => {
      await this.book.replace(command.companyId, command.contactId, details, command.role);
      await this.gestures.publish({
        type: CONTACT_UPDATED,
        site: company,
        subjectId: command.contactId,
        actor: { kind: "team" },
      });
      await this.events.publishTraced(
        new ContactUpdatedByStaffEvent(
          company,
          contactRef(command.contactId, details),
          command.role,
        ),
      );
    });
  }
}
