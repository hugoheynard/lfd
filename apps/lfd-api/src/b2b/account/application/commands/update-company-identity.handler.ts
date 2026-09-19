import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { Company } from "../../domain/entities/company.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyStepReachedEvent } from "../../domain/events/company-step-reached.event.js";
import { CompanyIdentityEditedEvent } from "../../domain/events/member-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { changedFields } from "../../domain/services/changed-fields.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { UpdateCompanyIdentityCommand } from "./company-settings-commands.js";

/**
 * Édite l'identité **souple** (enseigne + TVA), réservé au gestionnaire. Le mur
 * d'abord, puis on charge l'agrégat et on le mute par sa méthode métier
 * (`editSoftIdentity`, qui normalise et borne) — jamais une écriture de colonne.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) :
 * `company.identity_edited`, qui nomme les champs changés sans leurs valeurs.
 * Un envoi qui ne change rien n'écrit pas de fait.
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
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateCompanyIdentityCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const before = identityOf(company);
    company.editSoftIdentity({
      enseigne: command.payload.enseigne,
      vatNumber: command.payload.vatNumber,
    });
    // Complète ce qui manquait à l'ouverture. Sans SIRET, pas d'activation
    // possible : ce serait un compte ouvert pour rien.
    company.completeLegalIdentity({
      raisonSociale: command.payload.raisonSociale,
      formeJuridique: command.payload.formeJuridique,
      siret: command.payload.siret,
      siren: command.payload.siren,
    });
    const fields = changedFields(IDENTITY_FIELDS, before, identityOf(company));
    await this.uow.run(async () => {
      await this.companies.save(company);
      if (fields.length > 0) {
        await this.events.publishTraced(new CompanyIdentityEditedEvent(command.companyId, fields));
      }
    });

    // Pièce d'activation « TVA » franchie dès qu'un numéro est présent. Le journal
    // dédoublonne par (société, étape) : seule la 1re fois compte.
    if (command.payload.vatNumber.trim() !== "") {
      this.events.publish(new CompanyStepReachedEvent(command.companyId, "vat"));
    }
  }
}

/** Les champs d'identité que le client peut écrire, dans l'ordre où le fait les nomme. */
const IDENTITY_FIELDS = [
  "enseigne",
  "vatNumber",
  "raisonSociale",
  "formeJuridique",
  "siret",
  "siren",
] as const;

type IdentityField = (typeof IDENTITY_FIELDS)[number];

function identityOf(company: Company): Record<IdentityField, string> {
  return {
    enseigne: company.enseigne,
    vatNumber: company.vatNumber,
    raisonSociale: company.raisonSociale,
    formeJuridique: company.formeJuridique,
    siret: company.siretDigits,
    siren: company.sirenDigits,
  };
}
