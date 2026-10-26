import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { QualityControlSettings } from "../../domain/entities/quality-control-settings.js";
import { QualityControlSettingsUpdatedEvent } from "../../domain/events/quality-control-settings.events.js";
import { QualityControlSettingsReader } from "../../domain/ports/quality-control-settings.reader.js";
import { QualityControlSettingsRepository } from "../../domain/ports/quality-control-settings.repository.js";
import { SetQualityControlSettingsCommand } from "./set-quality-control-settings.command.js";

/**
 * Pose les réglages du contrôle qualité (Réglages › Commandes, décision de
 * Hugo, 2026-10-26). L'état remplacé est relu DANS la transaction ; l'écriture
 * et son fait partent ensemble — un journal en panne annule la bascule.
 *
 * Reposer l'état en vigueur n'écrit rien et ne journalise rien : l'auteur figé
 * reste celui qui l'a vraiment posé. Désactiver un niveau ne touche à aucun
 * contrôle déjà rendu, ni à une retenue déjà posée (plan, D10).
 */
@CommandHandler(SetQualityControlSettingsCommand)
export class SetQualityControlSettingsHandler implements ICommandHandler<
  SetQualityControlSettingsCommand,
  void
> {
  constructor(
    private readonly reader: QualityControlSettingsReader,
    private readonly settings: QualityControlSettingsRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetQualityControlSettingsCommand): Promise<void> {
    const next = QualityControlSettings.of({
      lineChecks: command.lineChecks,
      orderChecks: command.orderChecks,
    });
    await this.uow.run(async () => {
      const previous = (await this.reader.current()) ?? QualityControlSettings.defaults();
      if (previous.equals(next)) {
        return;
      }
      await this.settings.save(next, this.clock.now(), command.staffUserId);
      await this.events.publishTraced(new QualityControlSettingsUpdatedEvent(next, previous));
    });
  }
}
