import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformSettingsRepository } from "../domain/platform-settings.repository.js";
import { UpdatePlatformSettingsCommand } from "./update-platform-settings.command.js";

/**
 * Écrit la config plateforme. Réservé au **staff** — la porte est l'`AdminAuthGuard`
 * sur la route ; la charge est déjà validée (Zod) à la frontière.
 */
@CommandHandler(UpdatePlatformSettingsCommand)
export class UpdatePlatformSettingsHandler implements ICommandHandler<
  UpdatePlatformSettingsCommand,
  void
> {
  constructor(private readonly settings: PlatformSettingsRepository) {}

  async execute(command: UpdatePlatformSettingsCommand): Promise<void> {
    await this.settings.save(command.settings);
  }
}
