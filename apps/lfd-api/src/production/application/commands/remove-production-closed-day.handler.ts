import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { ProductionClosedDayRemovedEvent } from "../../domain/events/production-settings.events.js";
import { ProductionClosedDayRepository } from "../../domain/ports/production-closed-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { RemoveProductionClosedDayCommand } from "./remove-production-closed-day.command.js";

/**
 * **Retirer un jour fermé.**
 *
 * Silencieux sur un jour qui n'était pas fermé : c'est déjà l'état demandé, et
 * un refus n'apprendrait rien à qui a cliqué deux fois. Le plan ne dit rien
 * d'un jour passé (vérifié le 2026-10-06) : son retrait est admis.
 */
@CommandHandler(RemoveProductionClosedDayCommand)
export class RemoveProductionClosedDayHandler implements ICommandHandler<
  RemoveProductionClosedDayCommand,
  void
> {
  constructor(
    private readonly closedDays: ProductionClosedDayRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveProductionClosedDayCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    await this.uow.run(async () => {
      if (await this.closedDays.remove(day)) {
        await this.events.publishTraced(new ProductionClosedDayRemovedEvent(day.value));
      }
    });
  }
}
