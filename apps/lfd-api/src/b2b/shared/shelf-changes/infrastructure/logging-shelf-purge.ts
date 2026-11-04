import { Injectable, Logger } from "@nestjs/common";

import { ShelfPurge, type ShelfPurgeRequest } from "../domain/ports/shelf-purge.js";

/**
 * **La purge de C1 : elle journalise ce qu'elle aurait effacé**, et rien de
 * plus — aucun cache n'existe encore (`plan-cache-du-catalogue.md`, C1). C2
 * et C3 la remplacent par la vraie purge, au même endroit du module.
 *
 * Une ligne structurée par fenêtre, au niveau `log` : elle n'alerte pas, elle
 * permet de mesurer combien de purges partiraient avant d'en payer une.
 */
@Injectable()
export class LoggingShelfPurge extends ShelfPurge {
  private readonly logger = new Logger(LoggingShelfPurge.name);

  purge(request: ShelfPurgeRequest): Promise<void> {
    const { order, windowOpenedAt } = request;
    this.logger.log({
      message: "Purge des rayons (journalisée, aucun cache en C1)",
      scope: order.kind,
      companyIds: order.kind === "companies" ? order.companyIds : [],
      windowOpenedAt: windowOpenedAt.toISOString(),
    });
    return Promise.resolve();
  }
}
