import { Injectable } from "@nestjs/common";

import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { Backorder } from "../domain/entities/backorder.js";
import { BackorderAbandonNeedsStaffError } from "../domain/errors/backorder-errors.js";
import { BackorderRepository } from "../domain/ports/backorder.repository.js";
import { BackorderJournalFacts } from "./backorder-journal-facts.js";

/** La commande d'origine, telle que l'annulation la tient sous verrou. */
export interface CancelledOrigin {
  readonly orderId: string;
  readonly orderNumber: string;
}

/**
 * **Abandonner un reliquat** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 5) :
 * l'agrégat refuse un reliquat déjà fermé, le dépôt écrit son sort, et
 * `backorder.abandoned` part au journal — dans l'unité de travail de
 * l'appelant, qui tient le verrou du reliquat.
 *
 * Deux appelants : le geste de l'équipe (`AbandonBackorderHandler`) et
 * l'annulation de la commande d'origine (`OrderCancellation`).
 */
@Injectable()
export class BackorderAbandonment {
  constructor(
    private readonly backorders: BackorderRepository,
    private readonly journal: Journal,
    private readonly clock: Clock,
  ) {}

  /**
   * Le reliquat déjà verrouillé, abandonné par `staffUserId`.
   *
   * @throws {BackorderClosedError} déjà transformé ou abandonné.
   */
  async abandon(locked: Backorder, originReference: string, staffUserId: string): Promise<void> {
    locked.abandon(this.clock.now(), staffUserId);
    await this.backorders.save(locked);
    await this.journal.append(BackorderJournalFacts.abandoned(locked, originReference));
  }

  /**
   * L'origine annulée abandonne son reliquat OUVERT ; un reliquat transformé
   * n'est pas touché — sa commande vit sa vie —, ni un reliquat déjà
   * abandonné. Sous le verrou de la commande que l'annulation tient déjà.
   *
   * @throws {BackorderAbandonNeedsStaffError} un reliquat ouvert, et un client qui annule.
   */
  async abandonOnOriginCancelled(
    origin: CancelledOrigin,
    staffUserId: string | null,
  ): Promise<void> {
    const backorder = await this.backorders.loadLockedByOrigin(origin.orderId);
    if (backorder === null || !backorder.isOpen) {
      return;
    }
    if (staffUserId === null) {
      throw new BackorderAbandonNeedsStaffError();
    }
    await this.abandon(backorder, origin.orderNumber, staffUserId);
  }
}
