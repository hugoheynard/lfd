import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  ORDER_DAY_CHANGE_RETENTION_MS,
  OrderDayChangePruner,
} from "../../domain/ports/order-day-change.pruner.js";
import { PruneOrderDayChangesCommand } from "./prune-order-day-changes.command.js";

/**
 * Le balayage du journal des journées du commerce.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 *
 * Idempotent : un passage manqué est rattrapé au suivant. Une journée dont
 * toutes les traces partent retombe à la version `0` — un écran qui la
 * regarderait encore relirait une fois.
 */
@CommandHandler(PruneOrderDayChangesCommand)
export class PruneOrderDayChangesHandler implements ICommandHandler<
  PruneOrderDayChangesCommand,
  number
> {
  constructor(
    private readonly pruner: OrderDayChangePruner,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const before = new Date(this.clock.now().getTime() - ORDER_DAY_CHANGE_RETENTION_MS);
    return this.pruner.pruneBefore(before);
  }
}
