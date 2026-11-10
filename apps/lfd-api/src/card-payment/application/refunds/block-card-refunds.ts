import { Injectable } from "@nestjs/common";

import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  type AmountRefundRequest,
  CardRefunds,
  type CardRefundTarget,
  type RemainderRefundRequest,
  type RequestedCardRefund,
} from "../../channels/requests/card-refunds.js";
import { CardSettlementReader } from "../../channels/requests/card-settlement.reader.js";
import type { CardSubject } from "../../channels/subjects/index.js";
import { CardRefundRequest } from "../../domain/entities/card-refund-request.js";
import { CardPaymentNotFoundError } from "../../domain/errors/card-payment-errors.js";
import {
  CardRefundAmountExceedsRemainderError,
  CardRefundNothingLeftError,
  CardRefundPaymentNotPaidError,
} from "../../domain/errors/card-refund-errors.js";
import { CardRefundRequestRepository } from "../../domain/ports/card-refund-request.repository.js";
import {
  announcedByOpenAmounts,
  remainderInProgress,
} from "../../domain/services/refund-siblings.js";
import { CardRefundDispatch } from "./card-refund-dispatch.js";
import { CardRefundRetrier } from "./card-refund-retrier.js";
import { CardRefundScope, type LockedPayment } from "./card-refund-scope.js";

/**
 * **`CardRefunds`, implémenté par le bloc** (plan M2, §3.3) — dans la
 * transaction de l'appelant. Chaque geste verrouille dans l'ordre du §3.6
 * (le sujet, puis le paiement), lit ses demandes sous ces verrous, et refuse
 * AVANT d'écrire : un refus absorbé par un abonné durable ne laisse aucune
 * instruction en erreur dans la transaction du reçu (§3.3, v10). L'unicité
 * « une `remainder` en cours » en base reste le filet, jamais le chemin.
 */
@Injectable()
export class BlockCardRefunds extends CardRefunds {
  constructor(
    private readonly scope: CardRefundScope,
    private readonly requests: CardRefundRequestRepository,
    private readonly reader: CardSettlementReader,
    private readonly retrier: CardRefundRetrier,
    private readonly dispatch: CardRefundDispatch,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {
    super();
  }

  async requestRemainder(
    target: CardRefundTarget,
    request: RemainderRefundRequest,
  ): Promise<readonly RequestedCardRefund[]> {
    if ("paymentId" in target) {
      const made = await this.remainderOf(await this.paidPayment(target.paymentId), request);
      if (made === null) {
        throw new CardRefundNothingLeftError(target.paymentId);
      }
      return [made];
    }
    return this.remaindersOfSubject(target.subject, request);
  }

  async requestAmount(request: AmountRefundRequest): Promise<RequestedCardRefund> {
    const locked = await this.paidPayment(request.paymentId);
    const siblings = await this.requests.ofPayment(request.paymentId);
    const inProgress = remainderInProgress(siblings);
    const available =
      locked.ledger.remainderCents() -
      announcedByOpenAmounts(siblings) -
      (inProgress?.view.announcedCents ?? 0);
    if (request.amountCents > available) {
      throw new CardRefundAmountExceedsRemainderError(request.amountCents, Math.max(0, available));
    }
    const created = CardRefundRequest.request({
      id: this.ids.next(),
      paymentId: request.paymentId,
      form: "amount",
      amountCents: request.amountCents,
      nature: request.nature,
      reason: request.reason,
      announcedCents: request.amountCents,
      requestedAt: this.clock.now(),
      requestedBy: request.requestedBy,
      firstAttemptAt: this.clock.now(),
    });
    await this.requests.save(created);
    this.dispatch.afterCommitFor(created.id);
    return requestedOf(created);
  }

  retry(requestId: string): Promise<void> {
    return this.retrier.retry(requestId);
  }

  /**
   * Une `remainder` par paiement ENCAISSÉ du sujet, du dernier au premier
   * (§3.3, v9) ; un paiement sans reste est passé. Le sujet est verrouillé
   * d'abord : sa position se lit sous son verrou.
   */
  private async remaindersOfSubject(
    subject: CardSubject,
    request: RemainderRefundRequest,
  ): Promise<readonly RequestedCardRefund[]> {
    await this.scope.settlementOf(subject.type).lockSubject(subject);
    const [position] = await this.reader.positionOf([subject]);
    const paid = (position?.payments ?? []).filter((payment) => payment.state === "paid");
    const made: RequestedCardRefund[] = [];
    for (const payment of [...paid].reverse()) {
      const locked = await this.scope.lock(payment.paymentId);
      const requested = locked === null ? null : await this.remainderOf(locked, request);
      if (requested !== null) {
        made.push(requested);
      }
    }
    return made;
  }

  /**
   * La `remainder` en cours du paiement ; pour `button`, une `stopped`
   * existante ; sinon une neuve, qui annonce ce qui reste (§7) — ou `null`
   * quand il ne reste rien.
   */
  private async remainderOf(
    locked: LockedPayment,
    request: RemainderRefundRequest,
  ): Promise<RequestedCardRefund | null> {
    const paymentId = locked.ledger.paymentId;
    const siblings = await this.requests.ofPayment(paymentId);
    const inProgress = remainderInProgress(siblings);
    if (inProgress !== null) {
      return requestedOf(inProgress);
    }
    const waiting = siblings.find(
      (sibling) => sibling.view.form === "remainder" && sibling.current === "stopped",
    );
    if (request.schedule === "button" && waiting !== undefined) {
      return requestedOf(waiting);
    }
    const announced = locked.ledger.remainderCents() - announcedByOpenAmounts(siblings);
    if (announced <= 0) {
      return null;
    }
    const now = this.clock.now();
    const created = CardRefundRequest.request({
      id: this.ids.next(),
      paymentId,
      form: "remainder",
      amountCents: null,
      nature: request.nature,
      reason: request.reason,
      announcedCents: announced,
      requestedAt: now,
      requestedBy: request.requestedBy,
      firstAttemptAt: request.schedule === "now" ? now : null,
    });
    await this.requests.save(created);
    if (request.schedule === "now") {
      this.dispatch.afterCommitFor(created.id);
    }
    return requestedOf(created);
  }

  /**
   * Le paiement nommé, verrouillé, et encaissé.
   *
   * @throws {CardPaymentNotFoundError} paiement inconnu.
   * @throws {CardRefundPaymentNotPaidError} jamais encaissé.
   */
  private async paidPayment(paymentId: string): Promise<LockedPayment> {
    const locked = await this.scope.lock(paymentId);
    if (locked === null) {
      throw new CardPaymentNotFoundError(paymentId);
    }
    if (!locked.ledger.paid) {
      throw new CardRefundPaymentNotPaidError(paymentId, "non encaissé");
    }
    return locked;
  }
}

function requestedOf(request: CardRefundRequest): RequestedCardRefund {
  const { id, paymentId, form, announcedCents, state } = request.view;
  return { requestId: id, paymentId, form, announcedCents, state };
}
