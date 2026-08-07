import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { Clock } from "../../../infra/time/clock.js";
import { PlatformSettingsRepository } from "../../../platform-settings/domain/platform-settings.repository.js";
import {
  CompanyActivationBlockedError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
import { CompanyActivatedEvent } from "../../domain/events/company-activated.event.js";
import { AdminCompanyReader } from "../../domain/ports/admin-company.reader.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { missingRequiredPieces } from "../../domain/services/activation-requirements.js";
import { ActivateCompanyByStaffCommand } from "./activate-company.command.js";

/**
 * Active un compte client (Porte B). Deux responsabilités, séparées :
 *
 * 1. **Policy de complétude** (ici) : toutes les pièces `required` (selon la
 *    config plateforme) doivent être présentes. Les pièces (TVA + KBIS + adresses)
 *    croisent plusieurs tables — on les lit via la fiche staff (`AdminCompanyReader`),
 *    c'est une règle **cross-agrégat**, hors de `Company`.
 * 2. **Transition d'état** (l'agrégat) : `Company.activate()` porte le passage
 *    `pending → active` et **refuse** toute société qui n'est pas `pending`.
 *
 * Aucun mur membership : l'auth staff garde la route en amont.
 */
@CommandHandler(ActivateCompanyByStaffCommand)
export class ActivateCompanyByStaffHandler implements ICommandHandler<
  ActivateCompanyByStaffCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly reader: AdminCompanyReader,
    private readonly settings: PlatformSettingsRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ActivateCompanyByStaffCommand): Promise<void> {
    // 1) Policy : la fiche assemble les pièces (plusieurs tables) ; on bloque si
    //    une pièce requise manque.
    const view = await this.reader.byId(command.companyId);
    if (view === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const missing = missingRequiredPieces(view, await this.settings.read());
    if (missing.length > 0) {
      throw new CompanyActivationBlockedError(
        command.companyId,
        missing,
        `Activation impossible : pièces requises manquantes (${missing.join(", ")}).`,
      );
    }

    // 2) Transition via l'agrégat, qui garde l'invariant « pending ». L'instant
    //    d'activation vient du `Clock` (temps métier de la requête) — l'agrégat
    //    reste pur, l'horloge est injectée.
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const activatedAt = this.clock.now();
    company.activate(activatedAt);
    await this.companies.save(company);

    // Jalon de conversion : publié après persistance de la transition.
    this.events.publish(new CompanyActivatedEvent(command.companyId, activatedAt));
  }
}
