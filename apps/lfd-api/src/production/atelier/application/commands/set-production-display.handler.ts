import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ProductionDisplaySettings } from "../../../shared/print/index.js";
import { ProductionDisplaySettingsUpdatedEvent } from "../../domain/events/production-display-settings.events.js";
import { NoProductPlacedError } from "../../domain/errors/production-display-errors.js";
import { ProductionDisplaySettingsReader } from "../../../shared/print/index.js";
import { ProductionDisplaySettingsRepository } from "../../../shared/print/index.js";
import { PlacedProducts } from "../../../workstations/index.js";
import { SetProductionDisplayCommand } from "./set-production-display.command.js";

/**
 * Pose le rangement du fournil (2026-10-30). L'état remplacé est relu dans la
 * transaction ; l'écriture et son fait partent ensemble — un journal en panne
 * annule le réglage. Reposer l'état en vigueur n'écrit rien et ne journalise
 * rien : l'auteur figé reste celui qui l'a vraiment posé.
 *
 * La bascule en mode prod (plan `fournil/plan-postes-du-fournil.md`, § 3.9)
 * est refusée tant qu'aucun produit n'a de poste. Rester en mode prod après
 * avoir retiré tous les postes n'est pas refusé : ce n'est pas un invariant,
 * le fournil se range alors comme en mode boutique, « à ranger ».
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
    private readonly placed: PlacedProducts,
  ) {}

  async execute(command: SetProductionDisplayCommand): Promise<void> {
    await this.uow.run(async () => {
      const previous = (await this.reader.current()) ?? ProductionDisplaySettings.defaults();
      const next = ProductionDisplaySettings.of({
        showSubcategories: command.showSubcategories,
        grouping: command.grouping ?? previous.grouping,
      });
      if (previous.equals(next)) {
        return;
      }
      if (next.grouping === "workstation" && previous.grouping !== "workstation") {
        await this.refuseEmptyWorkstationGrouping();
      }
      const authors = await this.authors.identify([command.staffUserId]);
      await this.settings.save(next, this.clock.now(), {
        staffUserId: command.staffUserId,
        name: authors.nameOf(command.staffUserId),
      });
      await this.events.publishTraced(new ProductionDisplaySettingsUpdatedEvent(next, previous));
    });
  }

  /** On ne bascule pas à vide. @throws {NoProductPlacedError} */
  private async refuseEmptyWorkstationGrouping(): Promise<void> {
    if ((await this.placed.count()) === 0) {
      throw new NoProductPlacedError();
    }
  }
}
