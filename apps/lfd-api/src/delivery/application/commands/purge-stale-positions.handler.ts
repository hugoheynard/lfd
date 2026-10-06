import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { GesturePositionPruner } from "../../domain/ports/gesture-position.pruner.js";
import { positionKeptSince } from "../../domain/services/position-retention.js";
import { PurgeStalePositionsCommand } from "./purge-stale-positions.command.js";

/** Combien d'arrêts un lot touche : une requête courte, qui ne tient pas la table. */
export const POSITION_PURGE_BATCH_SIZE = 500;

/**
 * La purge des positions au geste. La frontière est `positionKeptSince` : la
 * même constante que le texte d'information du livreur et le registre.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change — l'arrêt reste clos, à la même
 * heure.
 *
 * Idempotent : un passage manqué est rattrapé au suivant, un passage rejoué ne
 * trouve plus rien. Rien n'est écrit dans les logs, et surtout pas une
 * coordonnée : le compte rendu est un nombre.
 */
@CommandHandler(PurgeStalePositionsCommand)
export class PurgeStalePositionsHandler implements ICommandHandler<
  PurgeStalePositionsCommand,
  number
> {
  constructor(
    private readonly pruner: GesturePositionPruner,
    private readonly clock: Clock,
  ) {}

  /**
   * Rend le nombre de positions effacées — clôtures, arrivées et points des
   * suggestions décidées (§6) confondus.
   */
  async execute(): Promise<number> {
    const before = positionKeptSince(this.clock.now());
    const closed = await drain((limit) => this.pruner.clearBatchClosedBefore(before, limit));
    const arrived = await drain((limit) => this.pruner.clearBatchArrivedBefore(before, limit));
    const decided = await drain((limit) => this.pruner.clearBatchDecidedBefore(before, limit));
    return closed + arrived + decided;
  }
}

/** Enchaîne les lots bornés jusqu'au lot incomplet ; rend le total. */
async function drain(batch: (limit: number) => Promise<number>): Promise<number> {
  let purged = 0;
  for (;;) {
    const count = await batch(POSITION_PURGE_BATCH_SIZE);
    purged += count;
    if (count < POSITION_PURGE_BATCH_SIZE) {
      return purged;
    }
  }
}
