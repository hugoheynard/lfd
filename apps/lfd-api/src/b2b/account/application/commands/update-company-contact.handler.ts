import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactUpdatedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyContactBook } from "../services/company-contact-book.service.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { UpdateCompanyContactCommand } from "./contact-commands.js";

/**
 * Remplace un contact additionnel, réservé au gestionnaire de l'entreprise.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 */
@CommandHandler(UpdateCompanyContactCommand)
export class UpdateCompanyContactHandler implements ICommandHandler<
  UpdateCompanyContactCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly book: CompanyContactBook,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateCompanyContactCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    // Le repository filtre sur (id ET companyId) : un contact d'une autre
    // entreprise est traité comme absent, jamais modifié.
    const details = ContactDetails.create(command.details);
    await this.uow.run(async () => {
      await this.book.replace(command.companyId, command.contactId, details, command.role);
      await this.events.publishTraced(
        new ContactUpdatedByMemberEvent(command.companyId, command.contactId, command.role),
      );
    });
  }
}
