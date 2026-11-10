import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { PaymentTermRequestedEvent } from "../../domain/events/member-acts.event.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { RequestPaymentTermCommand } from "./company-settings-commands.js";

/**
 * Enregistre la condition de règlement **demandée** par le client, réservé au
 * gestionnaire. Le mur d'abord ; puis l'agrégat arbitre : `requestPaymentTerm`
 * ne touche jamais le terme convenu (staff-only), et demander le terme déjà en
 * vigueur retire la demande (rien « en attente »).
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) :
 * la demande d'avant et celle d'après.
 */
@CommandHandler(RequestPaymentTermCommand)
export class RequestPaymentTermHandler implements ICommandHandler<RequestPaymentTermCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RequestPaymentTermCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const before = company.requestedTerm;
    company.requestTerm(command.term);
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new PaymentTermRequestedEvent(
          companyNamed(command.companyId, company),
          before,
          company.requestedTerm,
        ),
      );
    });
  }
}
