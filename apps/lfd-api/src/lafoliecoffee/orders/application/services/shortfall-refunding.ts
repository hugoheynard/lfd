import { Injectable } from "@nestjs/common";

import { CardRefunds } from "../../../../card-payment/channels/requests/index.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { ShortfallRefundSubjectLock } from "../../domain/ports/shortfall-refund-subject.js";
import {
  shortfallRefundGateOf,
  shortfallRefundOf,
  type ShortfallRefundSubject,
  type ShortfallRefundVerdict,
} from "../../domain/services/shortfall-refund.js";
import { SHORTFALL_REFUND_REASON, ShortfallRefundMoneyReader } from "./shortfall-refund-money.js";

/** La commande verrouillée, et ce que la phase 1 en a jugé. */
export interface JudgedShortfallRefund {
  readonly subject: ShortfallRefundSubject;
  readonly verdict: ShortfallRefundVerdict;
}

/** Le sujet du journal : la commande, sous son numéro. */
const ORDER_SUBJECT = "order";

/**
 * **Le reste d'un départ incomplet, remboursé au solde** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2) — juger,
 * puis écrire, dans l'unité de travail de l'appelant (le reçu de l'abonné, ou
 * celle du geste « Rembourser le reste »).
 *
 * **Phase 1 — juger** ({@link judgeLocked}) : le verrou `orders`, puis ce qui
 * se juge sans l'argent, puis l'argent relu sous le verrou. L'adoption du
 * premier paiement est la seule écriture avant de juger : sans argent ni
 * réseau, validée avec l'appelant ou annulée avec tout.
 *
 * **Phase 2 — écrire** ({@link request}) : une demande `amount`, nature
 * `adjustment`, raison `shortfall`, par part. Aucune erreur n'y est
 * attrapée : sous le verrou, un refus de `requestAmount` n'est qu'un filet,
 * et il annule tout ce que l'appelant a écrit. L'exécuteur du bloc carte part
 * après validation.
 */
@Injectable()
export class ShortfallRefunding {
  constructor(
    private readonly subjects: ShortfallRefundSubjectLock,
    private readonly money: ShortfallRefundMoneyReader,
    private readonly refunds: CardRefunds,
    private readonly journal: Journal,
  ) {}

  /** Phase 1, sous le verrou. `null` : commande inconnue. */
  async judgeLocked(orderId: string): Promise<JudgedShortfallRefund | null> {
    const subject = await this.subjects.lock(orderId);
    if (subject === null) {
      return null;
    }
    const gate = shortfallRefundGateOf(subject);
    if (gate !== null) {
      return { subject, verdict: gate };
    }
    const money = await this.money.of(orderId, "adopt");
    return { subject, verdict: shortfallRefundOf(subject, money) };
  }

  /**
   * Phase 2 : une demande par part. `requestedBy` : la fiche staff du geste,
   * `null` pour l'abonné.
   */
  async request(
    verdict: Extract<ShortfallRefundVerdict, { kind: "refund" }>,
    requestedBy: string | null,
  ): Promise<void> {
    for (const part of verdict.parts) {
      await this.refunds.requestAmount({
        paymentId: part.paymentId,
        amountCents: part.amountCents,
        nature: "adjustment",
        reason: SHORTFALL_REFUND_REASON,
        requestedBy,
      });
    }
  }

  /** Le blocage au journal, dans la transaction de l'appelant ; l'acteur est celui du contexte. */
  async note(
    subject: ShortfallRefundSubject,
    verdict: Extract<ShortfallRefundVerdict, { kind: "blocked" }>,
  ): Promise<void> {
    await this.journal.append({
      type: "order.shortfall_refund_blocked",
      subjectType: ORDER_SUBJECT,
      subjectId: subject.orderId,
      payload: {
        subjectLabel: subject.reference,
        cause: verdict.cause,
        amountCents: verdict.amountCents,
        stoppedAmount: verdict.stoppedAmount,
      },
    });
  }
}
