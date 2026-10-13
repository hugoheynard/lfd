import { Injectable } from "@nestjs/common";

import { OrderRefundRequest } from "../../domain/entities/order-refund-request.js";
import type { CancelledOrderRefund } from "../../domain/events/order-cancelled.event.js";
import type { CancellationSubject } from "../../domain/ports/cancellation-subject.reader.js";
import { OrderRefundRequestRepository } from "../../domain/ports/order-refund-request.repository.js";
import { OrderRefundDispatch } from "./order-refund-dispatch.js";

/**
 * **L'argent à rendre d'une commande payée qu'on annule** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C4.4, C4.6).
 *
 * Dans l'unité de travail de l'annulation, sous le verrou de la ligne
 * `orders` : le reste se lit sur le carnet RELU sous ce verrou (`lock()`), la
 * demande s'écrit avec l'annulation, ou rien. Aucun appel à Stripe : la
 * demande EST la file ; l'exécuteur part après validation.
 */
@Injectable()
export class CancellationRefundRequester {
  constructor(
    private readonly requests: OrderRefundRequestRepository,
    private readonly dispatch: OrderRefundDispatch,
  ) {}

  /**
   * Rend ce qui est promis — `null` quand il ne reste rien à rendre (C4.4).
   * `requestedBy` : la fiche staff, ou `null` quand un client annule lui-même
   * (lot C6, C6.6 — la colonne l'admettait déjà).
   */
  async requestFor(
    locked: CancellationSubject,
    requestedBy: string | null,
    now: Date,
  ): Promise<CancelledOrderRefund | null> {
    const announcedCents = locked.refunds.refundableCents;
    if (announcedCents <= 0) {
      return null;
    }
    // Une seconde demande est impossible : la clé primaire est la commande,
    // et `cancel()` vient de franchir sous le verrou de sa ligne (C4.6).
    await this.requests.save(
      OrderRefundRequest.request({
        orderId: locked.orderId,
        cause: "cancellation",
        announcedCents,
        requestedAt: now,
        requestedBy,
        firstAttemptAt: now,
      }),
    );
    this.dispatch.afterCommitFor(locked.orderId);
    return { announcedCents };
  }
}
