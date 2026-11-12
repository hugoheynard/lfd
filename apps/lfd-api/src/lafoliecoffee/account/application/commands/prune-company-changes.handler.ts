import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import {
  COMPANY_CHANGE_RETENTION_MS,
  CompanyChangePruner,
} from "../../domain/ports/company-change.pruner.js";
import { PruneCompanyChangesCommand } from "./prune-company-changes.command.js";

/**
 * Le balayage du journal des comptes clients.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, et aucun fait métier ne change.
 *
 * Idempotent. Un journal vidé rend `0` : une relecture de trop, jamais un
 * numéro qui ment — la séquence ne redémarre pas.
 */
@CommandHandler(PruneCompanyChangesCommand)
export class PruneCompanyChangesHandler implements ICommandHandler<
  PruneCompanyChangesCommand,
  number
> {
  constructor(
    private readonly pruner: CompanyChangePruner,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<number> {
    const before = new Date(this.clock.now().getTime() - COMPANY_CHANGE_RETENTION_MS);
    return this.pruner.pruneBefore(before);
  }
}
