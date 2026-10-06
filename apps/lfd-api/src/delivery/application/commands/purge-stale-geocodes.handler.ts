import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { GeocodeCachePruner } from "../../domain/ports/geocode-cache.pruner.js";
import { geocodeFreshSince } from "../delivery-routing-support.js";
import { PurgeStaleGeocodesCommand } from "./purge-stale-geocodes.command.js";

/** Combien d'entrées un lot efface : une requête courte, qui ne tient pas la table. */
export const GEOCODE_PURGE_BATCH_SIZE = 500;

/**
 * La purge du cache du géocodage. La frontière est CELLE de la lecture
 * (`geocodeFreshSince`) : ce qui n'est plus lu est ce qui s'efface, par une
 * seule définition de la durée.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 *
 * Idempotent : un passage manqué est rattrapé au suivant, un passage rejoué ne
 * trouve plus rien.
 */
@CommandHandler(PurgeStaleGeocodesCommand)
export class PurgeStaleGeocodesHandler implements ICommandHandler<
  PurgeStaleGeocodesCommand,
  number
> {
  constructor(
    private readonly pruner: GeocodeCachePruner,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const before = geocodeFreshSince(this.clock.now());
    let purged = 0;
    for (;;) {
      const batch = await this.pruner.pruneBatchBefore(before, GEOCODE_PURGE_BATCH_SIZE);
      purged += batch;
      if (batch < GEOCODE_PURGE_BATCH_SIZE) {
        return purged;
      }
    }
  }
}
