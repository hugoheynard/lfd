import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderCutoffRulesReader } from "../../channels/commerce/order-cutoff-rules.reader.js";
import { ProductionCloseSettings } from "../../domain/entities/production-close-settings.js";
import { ProductionCloseSettingsChangedEvent } from "../../domain/events/production-settings.events.js";
import { ProductionCloseSettingsRepository } from "../../domain/ports/production-close-settings.repository.js";
import { latestOrderCutoff } from "../../domain/services/latest-order-cutoff.js";
import { ChangeProductionCloseSettingsCommand } from "./change-production-close-settings.command.js";

/**
 * **Le réglage d'arrêt du plan**, posé depuis Production › Réglages.
 *
 * L'heure limite la plus tardive est lue au commerce AVANT la transaction (le
 * canal ne la partage pas) et passée à l'agrégat, qui juge. Une heure limite
 * déplacée dans l'intervalle n'est pas rattrapée : le réglage suivant la
 * reverra, et la page Réglages la montre.
 *
 * Un réglage reposé à l'identique n'écrit rien et ne journalise rien. Sinon :
 * l'écriture et le fait dans la même transaction — un journal en panne annule
 * le réglage.
 *
 * Rend `void` : le client relit (§4).
 */
@CommandHandler(ChangeProductionCloseSettingsCommand)
export class ChangeProductionCloseSettingsHandler implements ICommandHandler<
  ChangeProductionCloseSettingsCommand,
  void
> {
  constructor(
    private readonly settings: ProductionCloseSettingsRepository,
    private readonly cutoffRules: OrderCutoffRulesReader,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ChangeProductionCloseSettingsCommand): Promise<void> {
    const cutoff = latestOrderCutoff(await this.cutoffRules.rules());
    await this.uow.run(async () => {
      const current = (await this.settings.load()) ?? ProductionCloseSettings.initial();
      const change = current.change(
        { mode: command.mode, closeAt: command.closeAt, alertAt: command.alertAt },
        cutoff,
        command.staffUserId,
        this.clock.now(),
      );
      if (change === null) {
        return;
      }
      await this.settings.save(current);
      await this.events.publishTraced(
        new ProductionCloseSettingsChangedEvent(change.before, change.after),
      );
    });
  }
}
