import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../feature-access/application/feature-access-author.js";
import { OrderCutoffSettings } from "../domain/order-cutoff-settings.js";
import { OrderCutoffSettingsUpdatedEvent } from "../domain/order-cutoff-settings.events.js";
import { OrderCutoffSettingsReader } from "../domain/order-cutoff-settings.reader.js";
import { OrderCutoffSettingsRepository } from "../domain/order-cutoff-settings.repository.js";
import { UpdateOrderCutoffSettingsCommand } from "./update-order-cutoff-settings.command.js";

/**
 * Pose le jour même (§8.3 ; l'interrupteur de l'heure limite générale qu'il
 * posait aussi est retiré le 2026-10-21). L'état remplacé est relu DANS la
 * transaction ; l'écriture et son fait partent ensemble — un
 * journal en panne annule la bascule.
 *
 * Reposer l'état courant n'écrit rien et ne journalise rien : un double clic
 * ne doit pas laisser deux bascules au journal pour un seul changement.
 */
@CommandHandler(UpdateOrderCutoffSettingsCommand)
export class UpdateOrderCutoffSettingsHandler implements ICommandHandler<
  UpdateOrderCutoffSettingsCommand,
  void
> {
  constructor(
    private readonly reader: OrderCutoffSettingsReader,
    private readonly settings: OrderCutoffSettingsRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateOrderCutoffSettingsCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const previous = await this.reader.current();
      const next = OrderCutoffSettings.pose({
        sameDayAllowed: command.patch.sameDayAllowed,
        at: this.clock.now(),
        author,
      });
      if (next.sameAs(previous)) {
        return;
      }
      await this.settings.put(next);
      await this.events.publishTraced(new OrderCutoffSettingsUpdatedEvent(next, previous));
    });
  }
}
