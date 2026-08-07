import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformSettingsRepository } from "../../../platform-settings/domain/platform-settings.repository.js";
import {
  CompanyActivationBlockedError,
  CompanyNotFoundError,
} from "../../domain/errors/account-errors.js";
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

    // 2) Transition via l'agrégat, qui garde l'invariant « pending ». `new Date()`
    //    faute de port Clock — impureté localisée à l'application, l'agrégat reste pur.
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    company.activate(new Date());
    await this.companies.save(company);
  }
}
