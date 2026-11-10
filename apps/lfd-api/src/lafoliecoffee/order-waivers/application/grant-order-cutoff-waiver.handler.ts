import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { OrderCutoffWaiverGrantedEvent } from "../domain/order-cutoff-waiver.events.js";
import { OrderCutoffWaiverRepository } from "../domain/order-cutoff-waiver.repository.js";
import { GrantOrderCutoffWaiverCommand } from "./grant-order-cutoff-waiver.command.js";

/**
 * **Accorde** une dérogation.
 *
 * L'auteur vient de la requête, jamais du corps : quelqu'un qui pourrait écrire
 * le nom d'un collègue dans le motif de sa propre décision rendrait la trace
 * inutile — et c'est exactement ce à quoi sert cette trace.
 *
 * Journalisée dans la transaction de l'écriture (depuis le 2026-09-19) : une
 * dérogation refusée par l'unicité n'écrit rien, et un journal en panne
 * n'accorde rien.
 */
@CommandHandler(GrantOrderCutoffWaiverCommand)
export class GrantOrderCutoffWaiverHandler implements ICommandHandler<
  GrantOrderCutoffWaiverCommand,
  string
> {
  constructor(
    private readonly waivers: OrderCutoffWaiverRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute({ payload, grantedByStaffId }: GrantOrderCutoffWaiverCommand): Promise<string> {
    return this.uow.run(async () => {
      const granted = await this.waivers.grant(payload, grantedByStaffId);
      await this.events.publishTraced(
        new OrderCutoffWaiverGrantedEvent(granted.id, granted.decision),
      );
      return granted.id;
    });
  }
}
