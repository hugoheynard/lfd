import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { AccountAlertOverridesStore } from "../../domain/ports/account-alert-overrides.store.js";
import { SaveAccountAlertOverrideCommand } from "./save-account-alert-override.command.js";

/** Écrit la dérogation d'un compte. La cohérence type/règle est tenue par le contrat. */
@CommandHandler(SaveAccountAlertOverrideCommand)
export class SaveAccountAlertOverrideHandler implements ICommandHandler<
  SaveAccountAlertOverrideCommand,
  void
> {
  constructor(private readonly overrides: AccountAlertOverridesStore) {}

  async execute(command: SaveAccountAlertOverrideCommand): Promise<void> {
    await this.overrides.save(command.companyId, command.override);
  }
}
