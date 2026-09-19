import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactAddedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyContactBook } from "../services/company-contact-book.service.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { AddCompanyContactCommand } from "./contact-commands.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { contactRef } from "../../domain/events/journal-names.js";

/**
 * Ajoute un contact additionnel à une entreprise, réservé à son gestionnaire.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 */
@CommandHandler(AddCompanyContactCommand)
export class AddCompanyContactHandler implements ICommandHandler<AddCompanyContactCommand, string> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly book: CompanyContactBook,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: AddCompanyContactCommand): Promise<string> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const details = ContactDetails.create(command.details);
    const company = await this.names.company(command.companyId);
    return this.uow.run(async () => {
      const contactId = await this.book.add(command.companyId, details, command.role);
      await this.events.publishTraced(
        new ContactAddedByMemberEvent(company, contactRef(contactId, details), command.role),
      );
      return contactId;
    });
  }
}
