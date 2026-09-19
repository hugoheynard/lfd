import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactRemovedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyContactRepository } from "../../domain/ports/company-contact.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { RemoveCompanyContactCommand } from "./contact-commands.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";

/**
 * Retire un contact additionnel, réservé au gestionnaire de l'entreprise.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 */
@CommandHandler(RemoveCompanyContactCommand)
export class RemoveCompanyContactHandler implements ICommandHandler<
  RemoveCompanyContactCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly contacts: CompanyContactRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: RemoveCompanyContactCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.names.company(command.companyId);
    await this.uow.run(async () => {
      await this.contacts.remove(command.companyId, command.contactId);
      await this.events.publishTraced(
        // Le retrait ne relit pas la fiche qu'il efface : l'id seul, le fait
        // d'ajout — toujours au journal — dit qui c'était.
        new ContactRemovedByMemberEvent(company, { id: command.contactId }),
      );
    });
  }
}
