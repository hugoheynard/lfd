import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { PrimaryContactChangedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { UpdatePrimaryContactCommand } from "./contact-commands.js";

/**
 * Édite le contact **principal** d'une entreprise, réservé à son gestionnaire. Le
 * mur d'abord ; puis on charge l'agrégat et on le mute (`changePrimaryContact`) —
 * le contact est validé par le VO `ContactDetails`, l'écriture passe par `save`.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 */
@CommandHandler(UpdatePrimaryContactCommand)
export class UpdatePrimaryContactHandler implements ICommandHandler<
  UpdatePrimaryContactCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdatePrimaryContactCommand): Promise<void> {
    // Le mur d'abord : on ne construit rien, on ne charge rien tant que le
    // droit d'agir sur CETTE entreprise n'est pas prouvé.
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.changePrimaryContact(ContactDetails.create(command.details));
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new PrimaryContactChangedByMemberEvent(companyNamed(command.companyId, company)),
      );
    });
  }
}
