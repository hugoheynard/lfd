import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { PackingSettings } from "../../domain/entities/packing-settings.js";
import { PackingSettingsReader } from "../../domain/ports/packing-settings.reader.js";
import { PackingSettingsRepository } from "../../domain/ports/packing-settings.repository.js";
import { SetPackingSettingsCommand } from "./set-packing-settings.command.js";

/**
 * Pose les réglages du colisage (Réglages › Colisage). Un réglage déjà en
 * vigueur n'écrit rien : l'auteur figé reste celui qui l'a vraiment posé. Les
 * bacs déjà partagés ne bougent pas quand on ferme le partage.
 */
@CommandHandler(SetPackingSettingsCommand)
export class SetPackingSettingsHandler implements ICommandHandler<SetPackingSettingsCommand, void> {
  constructor(
    private readonly reader: PackingSettingsReader,
    private readonly settings: PackingSettingsRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetPackingSettingsCommand): Promise<void> {
    const next = PackingSettings.of({ halfSharing: command.halfSharing });
    await this.uow.run(async () => {
      const before = await this.reader.current();
      if (before?.equals(next) === true) {
        return;
      }
      await this.settings.save(next, this.clock.now(), command.staffUserId);
    });
  }
}
