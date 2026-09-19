import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { BillingAddressSavedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { SaveBillingAddressCommand } from "./address-commands.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";

/**
 * Enregistre l'adresse de facturation, réservé au gestionnaire de l'entreprise.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 */
@CommandHandler(SaveBillingAddressCommand)
export class SaveBillingAddressHandler implements ICommandHandler<SaveBillingAddressCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly addresses: CompanyAddressRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
  ) {}

  async execute(command: SaveBillingAddressCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.names.company(command.companyId);
    await this.uow.run(async () => {
      await this.addresses.saveBilling(command.companyId, command.payload);
      await this.events.publishTraced(
        new BillingAddressSavedByMemberEvent(company, command.payload),
      );
    });
    // Pièce d'activation « facturation » franchie (journal idempotent par étape).
    this.events.publish(new CompanyStepReachedEvent(company.id, company.name, "billing"));
  }
}
