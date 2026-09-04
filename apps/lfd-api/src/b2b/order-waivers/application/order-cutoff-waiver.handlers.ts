import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";
import type { OrderCutoffWaiverView } from "@lfd/contracts";

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
 */
@CommandHandler(GrantOrderCutoffWaiverCommand)
export class GrantOrderCutoffWaiverHandler implements ICommandHandler<
  GrantOrderCutoffWaiverCommand,
  string
> {
  constructor(private readonly waivers: OrderCutoffWaiverRepository) {}

  async execute(command: GrantOrderCutoffWaiverCommand): Promise<string> {
    return this.waivers.grant(command.payload, command.grantedByStaffId);
  }
}

@CommandHandler(RevokeOrderCutoffWaiverCommand)
export class RevokeOrderCutoffWaiverHandler implements ICommandHandler<
  RevokeOrderCutoffWaiverCommand,
  void
> {
  constructor(private readonly waivers: OrderCutoffWaiverRepository) {}

  async execute(command: RevokeOrderCutoffWaiverCommand): Promise<void> {
    await this.waivers.revoke(command.id);
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
