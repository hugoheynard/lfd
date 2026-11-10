import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { OrderLateFeeClearedEvent } from "../domain/order-late-fee.events.js";
import { OrderLateFeeRepository } from "../domain/order-late-fee.repository.js";
import { ClearOrderLateFeeCommand } from "./clear-order-late-fee.command.js";

/**
 * **Retire** la surtaxe. Retirer un réglage absent reste un succès sans trace :
 * rien n'a changé, et un fait qui dirait « retirée » sur une surtaxe qui
 * n'existait pas mentirait au lecteur.
 */
@CommandHandler(ClearOrderLateFeeCommand)
export class ClearOrderLateFeeHandler implements ICommandHandler<ClearOrderLateFeeCommand, void> {
  constructor(
    private readonly fees: OrderLateFeeRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(): Promise<void> {
    await this.uow.run(async () => {
      const before = await this.fees.read();
      if (before === null) {
        return;
      }
      await this.fees.clear();
      await this.events.publishTraced(new OrderLateFeeClearedEvent(before));
    });
  }
}
