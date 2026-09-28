import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import {
  DAY_CHANGE_RETENTION_MS,
  ProductionDayChangePruner,
} from "../../domain/ports/production-day-change.pruner.js";
import { PruneProductionDayChangesCommand } from "./prune-production-day-changes.command.js";

/**
 * Le balayage du journal des journées du fournil.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 *
 * Idempotent : un passage manqué est rattrapé au suivant, un passage rejoué ne
 * trouve plus rien. Une journée dont toutes les traces partent retombe à la
 * version `0` — un écran qui la regarderait encore relirait une fois, et c'est
 * tout ce que ça coûte.
 */
@CommandHandler(PruneProductionDayChangesCommand)
export class PruneProductionDayChangesHandler implements ICommandHandler<
  PruneProductionDayChangesCommand,
  number
> {
  constructor(
    private readonly pruner: ProductionDayChangePruner,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const before = new Date(this.clock.now().getTime() - DAY_CHANGE_RETENTION_MS);
    return this.pruner.pruneBefore(before);
  }
}
