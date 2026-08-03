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
 * Active un compte client (Porte B). Le **gate** vit ici, côté serveur : la
 * société doit être `pending` et toutes ses pièces `required` (selon la config
 * plateforme) présentes — sinon `CompanyActivationBlockedError` (409). L'état des
 * pièces est lu via la fiche staff (`AdminCompanyReader`), qui porte déjà TVA +
 * KBIS + adresses. Aucun mur membership : l'auth staff garde la route en amont.
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
    const company = await this.reader.byId(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    if (company.status !== "pending") {
      throw new CompanyActivationBlockedError(
        command.companyId,
        [],
        "Seul un compte en attente peut être activé.",
      );
    }
    const missing = missingRequiredPieces(company, await this.settings.read());
    if (missing.length > 0) {
      throw new CompanyActivationBlockedError(
        command.companyId,
        missing,
        `Activation impossible : pièces requises manquantes (${missing.join(", ")}).`,
      );
    }
    await this.companies.markActive(command.companyId);
  }
}
