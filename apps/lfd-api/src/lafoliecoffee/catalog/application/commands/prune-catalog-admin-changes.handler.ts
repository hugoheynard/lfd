import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  CATALOG_ADMIN_CHANGE_RETENTION_MS,
  CatalogAdminChangePruner,
} from "../../domain/ports/catalog-admin-change.pruner.js";
import { PruneCatalogAdminChangesCommand } from "./prune-catalog-admin-changes.command.js";

/**
 * Le balayage du journal de l'écran Catalogue.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 *
 * Idempotent. Un journal vidé rend `0` : une relecture de trop, jamais un
 * numéro qui ment — la séquence ne redémarre pas.
 */
@CommandHandler(PruneCatalogAdminChangesCommand)
export class PruneCatalogAdminChangesHandler implements ICommandHandler<
  PruneCatalogAdminChangesCommand,
  number
> {
  constructor(
    private readonly pruner: CatalogAdminChangePruner,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const before = new Date(this.clock.now().getTime() - CATALOG_ADMIN_CHANGE_RETENTION_MS);
    return this.pruner.pruneBefore(before);
  }
}
