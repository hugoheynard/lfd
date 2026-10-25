import { Injectable } from "@nestjs/common";

import { OrderNotCancellableError } from "../../domain/errors/order-cancellation-errors.js";
import {
  AccountOrderEngagementReader,
  type AccountEngagement,
} from "../../domain/ports/account-order-engagement.js";
import type { CancellationSubject } from "../../domain/ports/cancellation-subject.reader.js";
import {
  cancellationOf,
  cancellationStateOf,
  type CancellableRegime,
  type CancellationState,
} from "../../domain/services/order-cancellation.js";
import type { CancellationAllowance } from "../../domain/services/cancellation-allowance.js";
import { settlementRegimeOf } from "../../domain/services/settlement-regime.js";

/**
 * **La règle d'annulation, avec ce qu'elle doit demander à la comptabilité**
 * (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.5).
 *
 * La règle elle-même reste pure (`cancellationOf`) ; ce service ne fait que
 * lui fournir l'engagement comptable d'une commande au compte — et à elle
 * seule : les autres régimes ne touchent pas la comptabilité. Partagé par le
 * geste (hors verrou, puis sous verrou) et par l'aperçu du détail, qui disent
 * donc la même phrase.
 *
 * Sous verrou, la lecture passe par la transaction de l'appelant (client
 * routé) : c'est elle qui fait autorité ; hors verrou, elle refuse tôt sans
 * rien toucher (S6).
 */
@Injectable()
export class CancellationRule {
  constructor(private readonly engagements: AccountOrderEngagementReader) {}

  /** L'état complet que la règle lit. */
  async stateOf(
    subject: CancellationSubject,
    inscribedDay: string | null,
  ): Promise<CancellationState> {
    return cancellationStateOf(subject, inscribedDay, await this.engagementOf(subject));
  }

  /**
   * Le régime sous lequel la commande s'annule, sous l'autorisation que le
   * noyau a calculée une fois (plan A1).
   *
   * @throws {OrderNotCancellableError} la règle refuse.
   */
  async regimeOf(
    subject: CancellationSubject,
    allowance: CancellationAllowance,
  ): Promise<CancellableRegime> {
    const decision = cancellationOf(await this.stateOf(subject, null), allowance);
    if (!decision.cancellable) {
      throw new OrderNotCancellableError(subject.orderId, decision.block);
    }
    return decision.regime;
  }

  /** L'engagement, demandé seulement pour une commande au compte. */
  private async engagementOf(subject: CancellationSubject): Promise<AccountEngagement | null> {
    if (settlementRegimeOf(subject.paymentStatus, subject.totalCents) !== "account") {
      return null;
    }
    return this.engagements.engagementOf(subject.orderId);
  }
}
