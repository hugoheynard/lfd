import type { AdminRefundRequest } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import {
  type CardRefundRequestView,
  CardSettlementReader,
} from "../../../../card-payment/channels/requests/index.js";
import { refundFailurePhraseOf } from "../../domain/services/refund-request-phrases.js";
import { orderCardSubject } from "./order-card-subject.js";

/**
 * **Le bandeau des remboursements** au détail staff (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.9 ; plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, §5.3, lot P1.c) : TOUTES les demandes de la commande, terminées
 * comprises, telles que le bloc `card-payment` les rend
 * (`refundRequestsOf`) — l'état, ce qui a été promis et rendu, et si
 * « Relancer » a un sens (`retryable`, calculé par le bloc, bail compris).
 *
 * Le bloc rend le code BRUT du dernier échec ; la phrase est celle du commerce
 * (`refundFailurePhraseOf`). Sans verrou : c'est un affichage — le bouton se
 * reprend sous verrou. Servi sous `b2b_orders:read`, comme le reste du détail.
 */
@Injectable()
export class AdminOrderRefundView {
  constructor(private readonly cards: CardSettlementReader) {}

  async of(orderId: string): Promise<readonly AdminRefundRequest[]> {
    const [requests] = await this.cards.refundRequestsOf([orderCardSubject(orderId)]);
    return (requests?.requests ?? []).map(adminRefundRequestOf);
  }
}

/** Une demande du bloc → la forme du contrat (§5.3). */
export function adminRefundRequestOf(request: CardRefundRequestView): AdminRefundRequest {
  return {
    id: request.id,
    paymentId: request.paymentId,
    form: request.form,
    nature: request.nature,
    reason: request.reason,
    state: request.state,
    announcedCents: request.announcedCents,
    issuedCents: request.issuedCents,
    requestedAt: request.requestedAt.toISOString(),
    issuedAt: request.issuedAt?.toISOString() ?? null,
    attempts: request.attempts,
    generation: request.generation,
    lastFailure: refundFailurePhraseOf(request.state, request.lastFailure, request.attempts),
    retryable: request.retryable,
  };
}
