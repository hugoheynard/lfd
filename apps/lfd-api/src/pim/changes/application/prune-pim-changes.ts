import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { PIM_CHANGE_RETENTION_MS, PimChangePruner } from "../domain/ports/pim-change.pruner.js";

/**
 * **Balayer le journal du référentiel** des traces de plus de sept jours
 * (`plan-lectures-du-pim.md`, § 4.1). Rend le nombre retiré.
 */
export class PrunePimChangesCommand {}

/**
 * Le balayage du journal du référentiel.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 *
 * Idempotent. Un journal vidé rend `0` : une relecture de trop, jamais un
 * numéro qui ment — la séquence ne redémarre pas.
 */
@CommandHandler(PrunePimChangesCommand)
export class PrunePimChangesHandler implements ICommandHandler<PrunePimChangesCommand, number> {
  constructor(
    private readonly pruner: PimChangePruner,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const before = new Date(this.clock.now().getTime() - PIM_CHANGE_RETENTION_MS);
    return this.pruner.pruneBefore(before);
  }
}
