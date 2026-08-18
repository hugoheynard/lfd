import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyNotFoundForAlertsError } from "../../domain/errors/alert-errors.js";
import { AccountAlertOverridesStore } from "../../domain/ports/account-alert-overrides.store.js";
import { AlertCompanyReader } from "../../domain/ports/company.reader.js";
import { ClearAccountAlertOverrideCommand } from "./clear-account-alert-override.command.js";

/**
 * Revenir au global. Idempotent par construction (le port supprime sans exiger
 * l'existence) : annuler une dérogation absente est un non-événement.
 */
@CommandHandler(ClearAccountAlertOverrideCommand)
export class ClearAccountAlertOverrideHandler implements ICommandHandler<
  ClearAccountAlertOverrideCommand,
  void
> {
  constructor(
    private readonly overrides: AccountAlertOverridesStore,
    private readonly companies: AlertCompanyReader,
  ) {}

  async execute(command: ClearAccountAlertOverrideCommand): Promise<void> {
    // Idempotent sur la dérogation, mais pas sur la société : effacer chez un
    // compte qui n'existe pas est une erreur d'appelant, pas un non-événement.
    if (!(await this.companies.exists(command.companyId))) {
      throw new CompanyNotFoundForAlertsError(command.companyId);
    }
    await this.overrides.clear(command.companyId, command.kind);
  }
}
