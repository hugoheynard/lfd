import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanySiretSetEvent } from "../../domain/events/company-siret-set.event.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyIdentityCorrectedEvent } from "../../domain/events/staff-acts.event.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { UpdateIdentityByStaffCommand } from "./update-identity-by-staff.command.js";

/**
 * Édite l'identité d'une société, à la place du client.
 *
 * Handler **staff** (Porte B) des pièces d'activation. Il ne rejoue **aucun mur
 * membership** — l'auth staff (`AdminAuthGuard`) garde la route en amont, et le
 * staff n'est membre d'aucune société. Il délègue directement au même port
 * d'écriture que son homologue client : la logique de persistance n'est écrite
 * qu'une fois, seul le mur diffère.
 */
@CommandHandler(UpdateIdentityByStaffCommand)
export class UpdateIdentityByStaffHandler implements ICommandHandler<
  UpdateIdentityByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateIdentityByStaffCommand): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const vatBefore = company.vatNumber;
    const siretBefore = company.siretDigits;
    // Le back-office **corrige** là où le client ne fait que compléter : une
    // faute de frappe saisie au comptoir restait gravée, et le compte portait
    // une identité fausse sans recours. Un champ vide ne réécrit rien.
    const identity = {
      raisonSociale: command.payload.raisonSociale,
      formeJuridique: command.payload.formeJuridique,
      siret: command.payload.siret,
      siren: command.payload.siren,
    };
    // Rejouer le geste ne change rien : ni écriture, ni fait au journal.
    if (!company.correctIdentity(command.payload)) {
      return;
    }
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new CompanyIdentityCorrectedEvent(companyNamed(command.companyId, company), identity),
      );
    });

    // Pièce « TVA » franchie dès qu'un numéro est présent (idempotent par étape).
    if (company.siretDigits !== "" && company.siretDigits !== siretBefore) {
      this.events.publish(new CompanySiretSetEvent(command.companyId));
    }
    if (company.vatNumber !== "" && company.vatNumber !== vatBefore) {
      this.events.publish(
        new CompanyStepReachedEvent(command.companyId, company.displayName(), "vat"),
      );
    }
  }
}
