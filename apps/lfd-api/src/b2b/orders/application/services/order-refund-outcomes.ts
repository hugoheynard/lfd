import { Injectable } from "@nestjs/common";

import type {
  CardSubject,
  SubjectRefundOutcome,
} from "../../../../card-payment/channels/subjects/index.js";
import type { SubjectRefundPosition } from "../../../../card-payment/channels/requests/index.js";
import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { JournalFact } from "../../../../platform/journal/journal-fact.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import {
  ORDER_REFUND_FAILED,
  ORDER_REFUND_REVERSED,
  OrderRefundFailedFact,
} from "../../domain/events/order-refund-failed.fact.js";
import { OrderRefundRejectedEvent } from "../../domain/events/order-refund-rejected.event.js";
import { OrderRefundSucceededFact } from "../../domain/events/order-refund-succeeded.fact.js";
import { OrderCardStandingReader } from "../../domain/ports/order-card-standing.reader.js";
import { OrderRefundStatusWriter } from "../../domain/ports/order-refund-status.writer.js";
import { attemptFailedFact, issuedDifferentlyFact } from "./order-refund-facts.js";

/** Le sujet des faits de remboursement : la commande, sous son numéro. */
const ORDER_SUBJECT = "order";

/** La commande dont on parle : son identifiant et son numéro (le libellé des faits). */
interface OrderLabel {
  readonly orderId: string;
  readonly orderNumber: string;
}

type Applying<K extends SubjectRefundOutcome["kind"]> = (
  order: OrderLabel,
  outcome: Extract<SubjectRefundOutcome, { kind: K }>,
) => Promise<void>;

/**
 * **Ce qu'un remboursement par carte fait à une commande** (plan M2, §3.3,
 * §3.6, lot P1.b) — l'implémentation `order` de `onRefundOutcome`, appelée par
 * `card-payment` APRÈS qu'il a écrit ses lignes, dans sa transaction, sous le
 * verrou de la commande (`lockSubject`).
 *
 * Ce que faisaient le constat d'`orders` (`RecordOrderRefundHandler`) et
 * `order-refund-facts.ts` côté VUE, par genre — une table, pas un aiguillage :
 *
 * - la vue : `refunded` quand Σ réussi = encaissé ET qu'elle était `paid` (la
 *   règle de `settle()`, qui ne part que de `paid` : une annulée encaissée
 *   après coup reste `failed`) ; de nouveau `paid` si une inversion rouvre un
 *   reste ;
 * - les faits durables `order.refund_succeeded | _failed | _reversed`, avec
 *   l'id de la ligne au carnet (`refundId`) — leurs abonnés restent dans `b2b` ;
 * - l'événement en mémoire `OrderRefundRejectedEvent`, par `AfterCommit` ;
 * - le journal `order.refund_recorded / _rejected / fully_refunded /
 *   refund_attempt_failed / refund_issued`.
 */
@Injectable()
export class OrderRefundOutcomes {
  private readonly applying: { readonly [K in SubjectRefundOutcome["kind"]]: Applying<K> } = {
    recorded: (order, o) => this.recorded(order, o.amountCents, o.status, o.position),
    succeeded: (order, o) => this.succeeded(order, o.refundId, o.amountCents, o.position),
    settled_elsewhere: (order, o) => this.succeeded(order, o.refundId, o.amountCents, o.position),
    failed: (order, o) => this.failed(order, o),
    reversed: (order, o) => this.reversed(order, o),
    rejected: (order, o) => this.rejected(order, o),
    attempted: (order, o) =>
      this.journal.append(
        attemptFailedFact(order.orderId, order.orderNumber, o.generation, o.failure),
      ),
    issued: (order, o) => this.issued(order, o.announcedCents, o.issuedCents),
  };

  constructor(
    private readonly standings: OrderCardStandingReader,
    private readonly status: OrderRefundStatusWriter,
    private readonly journal: Journal,
    private readonly durable: DurablePublisher,
    private readonly afterCommit: AfterCommit,
    private readonly events: DomainEventPublisher,
  ) {}

  /** @throws {OrderNotFoundError} la commande n'existe pas — `card-payment` ne l'invente pas. */
  async apply(subject: CardSubject, outcome: SubjectRefundOutcome): Promise<void> {
    const standing = await this.standings.ofOrder(subject.id);
    if (standing === null) {
      throw new OrderNotFoundError(subject.id);
    }
    await this.dispatch({ orderId: standing.orderId, orderNumber: standing.orderNumber }, outcome);
  }

  private dispatch<K extends SubjectRefundOutcome["kind"]>(
    order: OrderLabel,
    outcome: Extract<SubjectRefundOutcome, { kind: K }>,
  ): Promise<void> {
    const applying = this.applying[outcome.kind] as Applying<K>;
    return applying(order, outcome);
  }

  private recorded(
    order: OrderLabel,
    amountCents: number,
    status: string,
    position: SubjectRefundPosition,
  ): Promise<void> {
    return this.journal.append(
      fact(order, "order.refund_recorded", {
        amountCents,
        refundedCents: position.refundedCents,
        status,
      }),
    );
  }

  private async succeeded(
    order: OrderLabel,
    refundId: string,
    amountCents: number,
    position: SubjectRefundPosition,
  ): Promise<void> {
    await this.recorded(order, amountCents, "succeeded", position);
    // L'avoir (E5b) : la comptabilité l'émet sur ce fait, s'il y a une facture carte à corriger.
    await this.durable.publish(new OrderRefundSucceededFact(order.orderId, refundId).durableFact());
    const settled = position.chargedCents > 0 && position.refundedCents === position.chargedCents;
    if (settled && (await this.status.markRefunded(order.orderId))) {
      await this.journal.append(
        fact(order, "order.fully_refunded", { refundedCents: position.refundedCents }),
      );
    }
  }

  private async failed(
    order: OrderLabel,
    outcome: Extract<SubjectRefundOutcome, { kind: "failed" }>,
  ): Promise<void> {
    const { refundId, providerRef } = outcome;
    await this.recorded(order, outcome.amountCents, outcome.status, outcome.position);
    await this.durable.publish(
      new OrderRefundFailedFact(
        ORDER_REFUND_FAILED,
        order.orderId,
        refundId,
        providerRef,
      ).durableFact(),
    );
  }

  private async reversed(
    order: OrderLabel,
    outcome: Extract<SubjectRefundOutcome, { kind: "reversed" }>,
  ): Promise<void> {
    const { refundId, providerRef } = outcome;
    await this.recorded(order, outcome.amountCents, outcome.status, outcome.position);
    await this.durable.publish(
      new OrderRefundFailedFact(
        ORDER_REFUND_REVERSED,
        order.orderId,
        refundId,
        providerRef,
      ).durableFact(),
    );
    if (outcome.position.refundedCents < outcome.position.chargedCents) {
      await this.status.restorePaid(order.orderId);
    }
  }

  /** Le refus se TRACE : le journal d'abord, la cloche après la transaction (§15 ter). */
  private async rejected(
    order: OrderLabel,
    outcome: Extract<SubjectRefundOutcome, { kind: "rejected" }>,
  ): Promise<void> {
    await this.journal.append(
      fact(order, "order.refund_rejected", {
        amountCents: outcome.amountCents,
        currency: outcome.currency,
        status: outcome.status,
        reason: outcome.reason,
      }),
    );
    const event = new OrderRefundRejectedEvent(
      order.orderId,
      order.orderNumber,
      outcome.providerRef,
      outcome.amountCents,
      outcome.reason,
    );
    this.afterCommit.defer(() => this.events.publish(event), "order.refund_rejected");
  }

  /** Le journal ne garde que l'écart : un montant rendu autre que celui annoncé (C4.4). */
  private async issued(
    order: OrderLabel,
    announcedCents: number,
    issuedCents: number,
  ): Promise<void> {
    if (announcedCents !== issuedCents) {
      await this.journal.append(
        issuedDifferentlyFact(order.orderId, order.orderNumber, announcedCents, issuedCents),
      );
    }
  }
}

function fact(
  order: OrderLabel,
  type: "order.refund_recorded" | "order.fully_refunded" | "order.refund_rejected",
  payload: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: ORDER_SUBJECT,
    subjectId: order.orderId,
    payload: { subjectLabel: order.orderNumber, ...payload },
  };
}
