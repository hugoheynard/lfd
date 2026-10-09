import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { OrderOpening } from "../../domain/order-opening.js";
import { OrderOpeningUpdatedEvent } from "../../domain/order-opening.events.js";
import { OrderOpeningReader } from "../../domain/ports/order-opening.reader.js";
import { OrderOpeningRepository } from "../../domain/ports/order-opening.repository.js";
import { UpdateOrderOpeningCommand } from "./update-order-opening.command.js";

/**
 * Pose le réglage d'ouverture. L'état remplacé est relu DANS la transaction :
 * un patch ne dit qu'une case, et l'autre doit être celle qui est écrite, pas
 * celle qu'un écran a vue. L'écriture et sa trace partent ensemble.
 */
@CommandHandler(UpdateOrderOpeningCommand)
export class UpdateOrderOpeningHandler implements ICommandHandler<UpdateOrderOpeningCommand, void> {
  constructor(
    private readonly reader: OrderOpeningReader,
    private readonly settings: OrderOpeningRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UpdateOrderOpeningCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const previous = await this.reader.current();
      const next = OrderOpening.pose({
        current: previous,
        patch: command.patch,
        at: this.clock.now(),
        author,
      });
      await this.settings.put(next);
      await this.events.publishTraced(new OrderOpeningUpdatedEvent(next, previous));
    });
  }
}
