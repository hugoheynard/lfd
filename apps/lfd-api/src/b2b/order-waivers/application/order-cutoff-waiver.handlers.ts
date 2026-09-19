import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";
import type { OrderCutoffWaiverView } from "@lfd/contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import {
  OrderCutoffWaiverGrantedEvent,
  OrderCutoffWaiverRevokedEvent,
} from "../domain/order-cutoff-waiver.events.js";
import { OrderCutoffWaiverRepository } from "../domain/order-cutoff-waiver.repository.js";
import {
  GrantOrderCutoffWaiverCommand,
  ListOrderCutoffWaiversQuery,
  RevokeOrderCutoffWaiverCommand,
} from "./order-cutoff-waiver.commands.js";

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
      const waiverId = await this.waivers.grant(payload, grantedByStaffId);
      await this.events.publishTraced(new OrderCutoffWaiverGrantedEvent(waiverId, payload));
      return waiverId;
    });
  }
}

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

@QueryHandler(ListOrderCutoffWaiversQuery)
export class ListOrderCutoffWaiversHandler implements IQueryHandler<
  ListOrderCutoffWaiversQuery,
  readonly OrderCutoffWaiverView[]
> {
  constructor(private readonly waivers: OrderCutoffWaiverRepository) {}

  async execute(query: ListOrderCutoffWaiversQuery): Promise<readonly OrderCutoffWaiverView[]> {
    return this.waivers.listFor(query.companyId);
  }
}
