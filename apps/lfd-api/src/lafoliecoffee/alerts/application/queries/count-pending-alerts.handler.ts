import type { PendingAlertCounts } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AccountAlertRepository } from "../../domain/ports/account-alert.repository.js";
import { CountPendingAlertsQuery } from "./count-pending-alerts.query.js";

/**
 * Le compte des alertes en attente, par société.
 *
 * La `Map` du port devient un objet au bord : c'est ce qui traverse le fil.
 * Les sociétés sans alerte en attente n'y figurent pas — l'écran lit une absence
 * comme un zéro, et on n'envoie pas une ligne par compte pour dire « rien ».
 */
@QueryHandler(CountPendingAlertsQuery)
export class CountPendingAlertsHandler implements IQueryHandler<
  CountPendingAlertsQuery,
  PendingAlertCounts
> {
  constructor(private readonly journal: AccountAlertRepository) {}

  async execute(): Promise<PendingAlertCounts> {
    return Object.fromEntries(await this.journal.countUnacknowledged());
  }
}
