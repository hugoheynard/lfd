import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { ProductionClosedDay } from "../../domain/entities/production-closed-day.js";
import { ProductionClosedDayAddedEvent } from "../../domain/events/production-settings.events.js";
import { ProductionClosedDayRepository } from "../../domain/ports/production-closed-day.repository.js";
import { todayOf } from "../../domain/services/relative-day.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { AddProductionClosedDayCommand } from "./add-production-closed-day.command.js";

/**
 * **Un jour fermé de plus** au calendrier du fournil (Q6).
 *
 * « Aujourd'hui » se lit à l'heure de la maison. Un jour déjà fermé ne
 * s'écrit pas deux fois et ne journalise rien : un double clic n'est pas un fait.
 */
@CommandHandler(AddProductionClosedDayCommand)
export class AddProductionClosedDayHandler implements ICommandHandler<
  AddProductionClosedDayCommand,
  void
> {
  constructor(
    private readonly closedDays: ProductionClosedDayRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AddProductionClosedDayCommand): Promise<void> {
    const now = this.clock.now();
    const day = ProductionClosedDay.declare({
      serviceDay: ServiceDay.of(command.serviceDay),
      today: todayOf(now),
      declaredBy: command.staffUserId,
      declaredAt: now,
    });
    await this.uow.run(async () => {
      if (await this.closedDays.add(day)) {
        await this.events.publishTraced(new ProductionClosedDayAddedEvent(day.serviceDay.value));
      }
    });
  }
}
