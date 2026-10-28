import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { ProductionTrancheSettings } from "../../domain/entities/production-tranche-settings.js";
import { ProductionTrancheSettingsUpdatedEvent } from "../../domain/events/production-tranche-settings.events.js";
import { ProductionTrancheSettingsReader } from "../../domain/ports/production-tranche-settings.reader.js";
import { ProductionTrancheSettingsRepository } from "../../domain/ports/production-tranche-settings.repository.js";
import { SetProductionTranchesCommand } from "./set-production-tranches.command.js";

/**
 * Pose les tranches de production (plan `fournil/plan-tranches-de-production.md`,
 * T1). L'agrégat juge la saisie AVANT toute lecture : un refus n'ouvre pas de
 * transaction. L'état remplacé est relu dans la transaction ; l'écriture et
 * son fait partent ensemble — un journal en panne annule le réglage.
 *
 * Reposer l'état en vigueur n'écrit rien et ne journalise rien : l'auteur figé
 * reste celui qui l'a vraiment posé.
 */
@CommandHandler(SetProductionTranchesCommand)
export class SetProductionTranchesHandler implements ICommandHandler<
  SetProductionTranchesCommand,
  void
> {
  constructor(
    private readonly reader: ProductionTrancheSettingsReader,
    private readonly settings: ProductionTrancheSettingsRepository,
    private readonly authors: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductionTranchesCommand): Promise<void> {
    const next = ProductionTrancheSettings.set(command.mode, command.fixedTranches);
    await this.uow.run(async () => {
      const previous = (await this.reader.current()) ?? ProductionTrancheSettings.defaults();
      if (previous.equals(next)) {
        return;
      }
      const authors = await this.authors.identify([command.staffUserId]);
      await this.settings.save(next, this.clock.now(), {
        staffUserId: command.staffUserId,
        name: authors.nameOf(command.staffUserId),
      });
      await this.events.publishTraced(new ProductionTrancheSettingsUpdatedEvent(next, previous));
    });
  }
}
