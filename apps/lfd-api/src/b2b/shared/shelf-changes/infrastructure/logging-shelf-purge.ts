import { Injectable, Logger } from "@nestjs/common";

import { ShelfPurge, type ShelfPurgeRequest } from "../domain/ports/shelf-purge.js";

/**
 * **La purge journalisée** : une trace de chaque fenêtre, posée en C1 avant
 * tout cache (`le-rayon-en-cache.md`), et gardée depuis à côté des
 * vraies purges (`FanOutShelfPurge`, C2).
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
      message: "Purge des rayons",
      scope: order.kind,
      companyIds: order.kind === "companies" ? order.companyIds : [],
      windowOpenedAt: windowOpenedAt.toISOString(),
    });
    return Promise.resolve();
  }
}
