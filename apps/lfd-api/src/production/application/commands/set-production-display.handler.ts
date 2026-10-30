import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { ProductionDisplaySettings } from "../../domain/entities/production-display-settings.js";
import { ProductionDisplaySettingsUpdatedEvent } from "../../domain/events/production-display-settings.events.js";
import { ProductionDisplaySettingsReader } from "../../domain/ports/production-display-settings.reader.js";
import { ProductionDisplaySettingsRepository } from "../../domain/ports/production-display-settings.repository.js";
import { SetProductionDisplayCommand } from "./set-production-display.command.js";

/**
 * Pose le rangement du fournil (2026-10-30). L'état remplacé est relu dans la
 * transaction ; l'écriture et son fait partent ensemble — un journal en panne
 * annule le réglage. Reposer l'état en vigueur n'écrit rien et ne journalise
 * rien : l'auteur figé reste celui qui l'a vraiment posé.
 */
@CommandHandler(SetProductionDisplayCommand)
export class SetProductionDisplayHandler implements ICommandHandler<
  SetProductionDisplayCommand,
  void
> {
  constructor(
    private readonly reader: ProductionDisplaySettingsReader,
    private readonly settings: ProductionDisplaySettingsRepository,
    private readonly authors: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductionDisplayCommand): Promise<void> {
    const next = ProductionDisplaySettings.of({ showSubcategories: command.showSubcategories });
    await this.uow.run(async () => {
      const previous = (await this.reader.current()) ?? ProductionDisplaySettings.defaults();
      if (previous.equals(next)) {
        return;
      }
      const authors = await this.authors.identify([command.staffUserId]);
      await this.settings.save(next, this.clock.now(), {
        staffUserId: command.staffUserId,
        name: authors.nameOf(command.staffUserId),
      });
      await this.events.publishTraced(new ProductionDisplaySettingsUpdatedEvent(next, previous));
    });
  }
}
