import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { Clock } from "../../../../platform/time/clock.js";
import { todayOf } from "../../../day/index.js";
import { provisionalPdfKey } from "../../domain/entities/provisional-print.js";
import { ProvisionalPrintPruner } from "../../domain/ports/provisional-print.pruner.js";
import { PruneProvisionalPrintsCommand } from "./prune-provisional-prints.command.js";

/**
 * Le balayage des impressions provisoires : toute journée strictement
 * antérieure au jour de Paris perd ses impressions — le fil d'une journée
 * n'a plus d'usage une fois le jour passé, et ces PDF ne sont pas le papier
 * officiel (celui de l'arrêt est archivé à part).
 *
 * Le PDF part d'abord, la ligne ensuite : une panne du stockage lève avant
 * qu'aucune ligne ne parte, et la nuit suivante retrouve tout. Une
 * suppression de fichier absent ne dit rien d'anormal (`delete` idempotent).
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 */
@CommandHandler(PruneProvisionalPrintsCommand)
export class PruneProvisionalPrintsHandler implements ICommandHandler<
  PruneProvisionalPrintsCommand,
  number
> {
  constructor(
    private readonly pruner: ProvisionalPrintPruner,
    private readonly documents: ProductionDocumentStore,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const stale = await this.pruner.staleBefore(todayOf(this.clock.now()));
    for (const print of stale) {
      await this.documents.delete(provisionalPdfKey(print.serviceDay, print.run));
    }
    return stale.length === 0 ? 0 : this.pruner.forget(stale.map((print) => print.id));
  }
}
