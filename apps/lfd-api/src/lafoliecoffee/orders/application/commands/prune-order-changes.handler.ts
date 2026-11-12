import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  ORDER_CHANGE_RETENTION_MS,
  OrderChangePruner,
} from "../../domain/ports/order-change.pruner.js";
import { PruneOrderChangesCommand } from "./prune-order-changes.command.js";

/**
 * Le balayage du journal de toutes les commandes.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 *
 * Idempotent. Un journal vidé rend `0` : une relecture de trop, jamais un
 * numéro qui ment — la séquence ne redémarre pas.
 */
@CommandHandler(PruneOrderChangesCommand)
export class PruneOrderChangesHandler implements ICommandHandler<PruneOrderChangesCommand, number> {
  constructor(
    private readonly pruner: OrderChangePruner,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const before = new Date(this.clock.now().getTime() - ORDER_CHANGE_RETENTION_MS);
    return this.pruner.pruneBefore(before);
  }
}
