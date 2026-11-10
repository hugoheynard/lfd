import { Injectable } from "@nestjs/common";

import { CardRefunds } from "../../../../card-payment/channels/requests/index.js";
import type { CancelledOrderRefund } from "../../domain/events/order-cancelled.event.js";
import { OrderCardAdoption } from "../../domain/ports/order-card-payments.js";
import { orderCardSubject } from "./order-card-subject.js";

/** Le code de la demande — 🔴 une valeur écrite (`card_payment.refund_request.reason`). */
export const CANCELLATION_REFUND_REASON = "cancellation";

/**
 * **L'argent à rendre d'une commande payée qu'on annule** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.4, C4.6 ;
 * plan `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §7, lot P1.c).
 *
 * Dans l'unité de travail de l'annulation, sous le verrou de la ligne
 * `orders` que l'appelant a pris (l'ordre du §3.6 : le sujet, puis les lignes
 * de `card-payment`) : une demande `remainder`, nature `return`, **par
 * paiement encaissé** de la commande — `CardRefunds.requestRemainder` sur le
 * SUJET, qui relit sous ces verrous ce qui reste. La demande s'écrit avec
 * l'annulation, ou rien. Aucun appel au prestataire : l'exécuteur de
 * `card-payment` part après validation, et son balayage reprend l'échec.
 *
 * Idempotent par le port : une `remainder` déjà en cours sur un paiement est
 * rendue, jamais doublée — l'ancienne garde « une demande par commande » (la
 * clé primaire d'`order_refund_request`) est devenue celle du bloc.
 */
@Injectable()
export class CancellationRefundRequester {
  constructor(
    private readonly refunds: CardRefunds,
    private readonly cards: OrderCardAdoption,
  ) {}

  /**
   * Rend ce qui est promis — `null` quand il ne reste rien à rendre (C4.4).
   * `requestedBy` : la fiche staff, ou `null` quand un client annule lui-même
   * (lot C6, C6.6).
   */
  async requestFor(
    orderId: string,
    requestedBy: string | null,
  ): Promise<CancelledOrderRefund | null> {
    // Une commande d'avant le bloc n'a pas de ligne de paiement : sans
    // adoption, rien ne serait rendu (§4.6). Rejoint la transaction ambiante.
    await this.cards.ensureFirst(orderId);
    const requested = await this.refunds.requestRemainder(
      { subject: orderCardSubject(orderId) },
      { nature: "return", reason: CANCELLATION_REFUND_REASON, schedule: "now", requestedBy },
    );
    const announcedCents = requested.reduce((sum, request) => sum + request.announcedCents, 0);
    return announcedCents > 0 ? { announcedCents } : null;
  }
}
