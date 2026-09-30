import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import {
  DELIVERY_DAY_CHANGE_RETENTION_MS,
  DeliveryDayChangePruner,
} from "../../domain/ports/delivery-day-change.pruner.js";
import { PruneDeliveryDayChangesCommand } from "./prune-delivery-day-changes.command.js";

/**
 * Le balayage du journal des journées de la livraison.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 *
 * Idempotent : un passage manqué est rattrapé au suivant, un passage rejoué ne
 * trouve plus rien.
 */
@CommandHandler(PruneDeliveryDayChangesCommand)
export class PruneDeliveryDayChangesHandler implements ICommandHandler<
  PruneDeliveryDayChangesCommand,
  number
> {
  constructor(
    private readonly pruner: DeliveryDayChangePruner,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const before = new Date(this.clock.now().getTime() - DELIVERY_DAY_CHANGE_RETENTION_MS);
    return this.pruner.pruneBefore(before);
  }
}
