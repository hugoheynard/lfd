import { Injectable, Logger } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import { ShelfPurgeBatch } from "../domain/shelf-purge-batch.js";
import type { ShelfChangeScope } from "../domain/shelf-change-scope.js";
import { ShelfPurge } from "../domain/ports/shelf-purge.js";
import { ShelfWindowTimer } from "../domain/ports/shelf-window-timer.js";

/** Au plus une purge par seconde (`le-rayon-en-cache.md` § 5). */
export const SHELF_PURGE_WINDOW_MS = 1000;

/**
 * **La fenêtre de purge** : le premier changement l'ouvre, tous ceux qui
 * arrivent pendant la seconde s'y regroupent, et la purge part à son terme.
 *
 * Fenêtre fixe plutôt que glissante : une ingestion continue repousserait
 * sans fin une fenêtre glissante, et aucun rayon ne serait jamais effacé.
 * Un redémarrage dans la seconde perd la purge en attente — la durée de vie
 * des rayons rattrape : 30 s au rayon public, 5 minutes au plus au rayon pro
 * depuis le 2026-11-04 (`le-rayon-en-cache.md`, § 6.1).
 */
@Injectable()
export class ShelfChangeWindow {
  private readonly logger = new Logger(ShelfChangeWindow.name);
  private batch = new ShelfPurgeBatch();
  private openedAt: Date | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly timer: ShelfWindowTimer,
    private readonly purge: ShelfPurge,
  ) {}

  /** Range un changement validé ; ouvre la fenêtre si elle est fermée. */
  record(scope: ShelfChangeScope): void {
    this.batch.add(scope);
    if (this.openedAt !== null) {
      return;
    }
    this.openedAt = this.clock.now();
    this.timer.after(SHELF_PURGE_WINDOW_MS, () => {
      void this.close();
    });
  }

  /** Ferme la fenêtre et passe sa purge ; un échec est journalisé, jamais rejoué. */
  private async close(): Promise<void> {
    const order = this.batch.order();
    const windowOpenedAt = this.openedAt;
    this.batch = new ShelfPurgeBatch();
    this.openedAt = null;
    if (order === null || windowOpenedAt === null) {
      return;
    }
    try {
      await this.purge.purge({ order, windowOpenedAt });
    } catch (error) {
      this.logger.warn(
        `Purge des rayons échouée (${order.kind}) : la durée de vie des rayons rattrapera. ` +
          `Cause : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
