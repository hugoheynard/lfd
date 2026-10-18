import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffSuggestionOrderChangedEvent } from "../../domain/events/staff-suggestion.events.js";
import { SuggestionOrderReader } from "../../domain/ports/suggestion-order.reader.js";
import { SuggestionOrderWriter } from "../../domain/ports/suggestion-order.writer.js";
import { suggestionOrder } from "../../domain/value-objects/suggestion-order.js";
import { SetStaffSuggestionOrderCommand } from "./set-staff-suggestion-order.command.js";

/**
 * **Règle l'ordre** entre suggestions concurrentes. L'ordre remplacé est relu
 * DANS la transaction : le fait dit ce qui était écrit, pas ce qu'un écran a
 * vu. Choisir l'ordre déjà en place n'écrit rien.
 */
@CommandHandler(SetStaffSuggestionOrderCommand)
export class SetStaffSuggestionOrderHandler implements ICommandHandler<
  SetStaffSuggestionOrderCommand,
  void
> {
  constructor(
    private readonly reader: SuggestionOrderReader,
    private readonly writer: SuggestionOrderWriter,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetStaffSuggestionOrderCommand): Promise<void> {
    const order = suggestionOrder(command.order);
    await this.uow.run(async () => {
      const previous = await this.reader.current();
      if (previous.order === order) {
        return;
      }
      await this.writer.put(order, { by: command.writtenBy, at: this.clock.now() });
      await this.events.publishTraced(new StaffSuggestionOrderChangedEvent(previous.order, order));
    });
  }
}
