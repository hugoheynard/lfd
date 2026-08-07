import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { UpdateCompanyIdentityCommand } from "./company-settings-commands.js";

/**
 * Édite l'identité **souple** (enseigne + TVA), réservé au gestionnaire. Le mur
 * d'abord, puis on charge l'agrégat et on le mute par sa méthode métier
 * (`editSoftIdentity`, qui normalise et borne) — jamais une écriture de colonne.
 */
@CommandHandler(UpdateCompanyIdentityCommand)
export class UpdateCompanyIdentityHandler implements ICommandHandler<
  UpdateCompanyIdentityCommand,
  void
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UpdateCompanyIdentityCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.editSoftIdentity({
      enseigne: command.payload.enseigne,
      tvaIntracom: command.payload.tvaIntracom,
    });
    await this.companies.save(company);

    // Pièce d'activation « TVA » franchie dès qu'un numéro est présent. Le journal
    // dédoublonne par (société, étape) : seule la 1re fois compte.
    if (command.payload.tvaIntracom.trim() !== "") {
      this.events.publish(new CompanyStepReachedEvent(command.companyId, "tva"));
    }
  }
}
