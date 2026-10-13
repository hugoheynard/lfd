import type { AdminOrderRefund } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { WallClock } from "../../../../platform/time/wall-clock.js";
import { refundRequestStateOf } from "../../domain/entities/order-refund-request.js";
import { refundPositionOf } from "../../domain/entities/order-refund.js";
import { OrderRefundRequestReader } from "../../domain/ports/order-refund-request.reader.js";
import { refundFailurePhraseOf } from "../../domain/services/refund-request-phrases.js";

/**
 * **Le bandeau du remboursement** au détail staff (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.9) : la demande,
 * son état LU au carnet, et si « Relancer » a un sens. Sans verrou : c'est un
 * affichage — le bouton se reprend sous verrou.
 */
@Injectable()
export class AdminOrderRefundView {
  constructor(
    private readonly reader: OrderRefundRequestReader,
    private readonly wall: WallClock,
  ) {}

  async of(orderId: string): Promise<AdminOrderRefund | null> {
    const snapshot = await this.reader.snapshotOf(orderId);
    if (snapshot === null) {
      return null;
    }
    const { request, refunds } = snapshot;
    const position = refundPositionOf(snapshot.chargedCents, refunds);
    const issued = refunds.find((refund) => refund.stripeRefundId === request.stripeRefundId);
    const state = refundRequestStateOf(request, {
      remainderCents: position.refundableCents,
      statusOf: (id) => refunds.find((refund) => refund.stripeRefundId === id)?.status ?? null,
    });
    const claimed =
      request.claimedUntil !== null &&
      request.claimedUntil.getTime() > this.wall.elapsedNow().getTime();
    return {
      state,
      announcedCents: request.announcedCents,
      issuedCents: issued?.amountCents ?? null,
      requestedAt: request.requestedAt.toISOString(),
      issuedAt: request.issuedAt?.toISOString() ?? null,
      attempts: request.attempts,
      lastFailure: refundFailurePhraseOf(state, request.lastFailure, request.attempts),
      retryable: (state === "to_issue" || state === "failed") && !claimed,
    };
  }
}
