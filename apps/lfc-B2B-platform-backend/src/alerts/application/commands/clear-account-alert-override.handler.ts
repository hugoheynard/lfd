import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AccountAlertOverridesStore } from "../../domain/ports/account-alert-overrides.store.js";
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
  constructor(private readonly overrides: AccountAlertOverridesStore) {}

  async execute(command: ClearAccountAlertOverrideCommand): Promise<void> {
    await this.overrides.clear(command.companyId, command.kind);
  }
}
