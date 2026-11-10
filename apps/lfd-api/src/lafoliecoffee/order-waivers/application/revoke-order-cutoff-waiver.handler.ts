import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { OrderCutoffWaiverRevokedEvent } from "../domain/order-cutoff-waiver.events.js";
import { OrderCutoffWaiverRepository } from "../domain/order-cutoff-waiver.repository.js";
import { RevokeOrderCutoffWaiverCommand } from "./revoke-order-cutoff-waiver.command.js";

/**
 * **Retire** une dérogation qui n'a pas servi. La ligne est supprimée : le fait
 * porte ce qu'elle décidait, sans quoi le retrait effacerait aussi la décision.
 */
@CommandHandler(RevokeOrderCutoffWaiverCommand)
export class RevokeOrderCutoffWaiverHandler implements ICommandHandler<
  RevokeOrderCutoffWaiverCommand,
  void
> {
  constructor(
    private readonly waivers: OrderCutoffWaiverRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RevokeOrderCutoffWaiverCommand): Promise<void> {
    await this.uow.run(async () => {
      const decision = await this.waivers.revoke(command.id);
      await this.events.publishTraced(new OrderCutoffWaiverRevokedEvent(command.id, decision));
    });
  }
}
