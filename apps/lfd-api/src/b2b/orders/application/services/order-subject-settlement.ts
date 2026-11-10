import { Injectable } from "@nestjs/common";

import {
  type CardSubject,
  type SubjectClaim,
  type SubjectDescription,
  type SubjectPaidOutcome,
  type SubjectPaymentRole,
  type SubjectReference,
  type SubjectRefundOutcome,
  SubjectSettlement,
} from "../../../../card-payment/channels/subjects/index.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderCardSubjectWithoutIntentError } from "../../domain/errors/order-payment-errors.js";
import { OrderPaidAfterCancellationEvent } from "../../cancellation/domain/events/order-paid-after-cancellation.event.js";
import { OrderPaidFact } from "../../domain/events/order-paid.fact.js";
import { OrderPaymentFailedEvent } from "../../domain/events/order-payment-failed.event.js";
import { CancelledOrderPaymentReader } from "../../cancellation/domain/ports/cancelled-order-payment.reader.js";
import {
  OrderCardStandingReader,
  type OrderCardStanding,
} from "../../domain/ports/order-card-standing.reader.js";
import { OrderLock } from "../../domain/ports/order-lock.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { ORDER_CARD_SUBJECT_TYPE, orderCardSubject } from "./order-card-subject.js";
import { OrderComplementSettlement } from "./order-complement-settlement.js";
import { OrderRefundOutcomes } from "./order-refund-outcomes.js";

/** Où l'équipe ouvre une commande au back-office — comme les cloches d'`orders`. */
const ORDER_SCREEN = "/commandes";

/**
 * **La commande, sujet du bloc `card-payment`** (plan
 * `documentation/commandes/modification/plan-m2-historique-de-transactions.md`,
 * §3.3, §3.6, §4.4) — l'implémentation `order` du canal retour, reliée par
 * `appBootstrap/card-payment-feed.module.ts`.
 *
 * Ce que faisait `ConfirmOrderPaymentHandler` (retiré au lot P0.c2), mais
 * APPELÉ par le webhook des cartes, dans SA transaction : le verrou de la
 * commande d'abord (l'ordre du §3.6), `markPaid` / `markPaymentFailed` par
 * l'intention — idempotents, conditionnés en base —, et les faits d'`orders`
 * au franchissement seulement : `order.paid`, `order.payment_failed`, et
 * `order.paid_after_cancellation` sous sa condition d'aujourd'hui (annulée
 * ET règlement `failed`, `prisma-cancelled-order-payment.reader.ts`).
 *
 * ⚠️ Le compte d'un `claim` n'est pas confronté : une commande ne sait pas
 * quel compte l'encaisse (la racine de composition le sait), et sa référence
 * est unique sur `orders`. Le jour d'un second compte pour les commandes, la
 * question se rouvre.
 */
@Injectable()
export class OrderSubjectSettlement extends SubjectSettlement {
  readonly subjectType = ORDER_CARD_SUBJECT_TYPE;

  constructor(
    private readonly lock: OrderLock,
    private readonly standings: OrderCardStandingReader,
    private readonly orders: OrderRepository,
    private readonly cancelled: CancelledOrderPaymentReader,
    private readonly durable: DurablePublisher,
    private readonly refunds: OrderRefundOutcomes,
    private readonly complements: OrderComplementSettlement,
  ) {
    super();
  }

  /** Le `FOR UPDATE` d'`orders` — le même que la facture carte (`prisma-order-invoicing-lock.ts`). */
  lockSubject(subject: CardSubject): Promise<void> {
    return this.lock.lock(subject.id);
  }

  /** Sa vue, ses faits et son journal (`OrderRefundOutcomes`, lot P1.b). */
  onRefundOutcome(subject: CardSubject, outcome: SubjectRefundOutcome): Promise<void> {
    return this.refunds.apply(subject, outcome);
  }

  /**
   * Route sur le rôle de la ligne (plan S2, §2.5) : le premier suit le chemin
   * d'aujourd'hui ; un complément ne touche que son projet — il ne marque
   * JAMAIS la commande payée.
   */
  async onPaid(
    subject: CardSubject,
    paymentId: string,
    _amountCents: number,
    role: SubjectPaymentRole,
  ): Promise<SubjectPaidOutcome> {
    if (role === "complement") {
      return this.complements.onPaid(subject, paymentId);
    }
    const { standing, providerRef } = await this.withIntent(subject);
    const paid = await this.orders.markPaid(providerRef);
    if (paid !== null) {
      await this.durable.publish(new OrderPaidFact(paid).durableFact());
      return "applied";
    }
    if (!standing.cancelled) {
      return "already_applied";
    }
    // Annulée : la base ne la rouvre jamais. L'argent est là — la cloche
    // « à rembourser » part si son règlement dit qu'elle n'avait pas été
    // payée ; une annulée déjà remboursée ne l'est pas deux fois (C4.11 bis).
    const refundDue = await this.cancelled.cancelledOrderOf(providerRef);
    if (refundDue !== null) {
      await this.durable.publish(new OrderPaidAfterCancellationEvent(refundDue).durableFact());
    }
    return "refused";
  }

  /**
   * Un complément refusé ne touche pas la commande (plan S2, §2.5) : le projet
   * reste `awaiting_payment`, le client réessaie jusqu'au délai.
   */
  async onPaymentFailed(
    subject: CardSubject,
    _paymentId: string,
    role: SubjectPaymentRole,
  ): Promise<void> {
    if (role === "complement") {
      return;
    }
    const { providerRef } = await this.withIntent(subject);
    const refused = await this.orders.markPaymentFailed(providerRef);
    if (refused !== null) {
      await this.durable.publish(new OrderPaymentFailedEvent(refused, "refused").durableFact());
    }
  }

  async isCancelled(subject: CardSubject): Promise<boolean> {
    return (await this.locked(subject)).cancelled;
  }

  async describe(subject: CardSubject): Promise<SubjectDescription> {
    const standing = await this.standings.ofOrder(subject.id);
    if (standing === null) {
      throw new OrderNotFoundError(subject.id);
    }
    return {
      label: `Commande ${standing.orderNumber}`,
      link: `${ORDER_SCREEN}/${standing.orderId}`,
    };
  }

  async claim(_account: string, providerRef: string): Promise<SubjectClaim | null> {
    const standing = await this.standings.ofIntent(providerRef);
    return standing === null ? null : claimOf(standing);
  }

  async referencesSince(since: Date): Promise<readonly SubjectReference[]> {
    const standings = await this.standings.withIntentCreatedSince(since);
    return standings.flatMap((standing) =>
      standing.providerRef === null
        ? []
        : [{ ...claimOf(standing), providerRef: standing.providerRef }],
    );
  }

  /** La commande, sous SON verrou — pris dans la transaction du webhook (§3.6). */
  private async locked(subject: CardSubject): Promise<OrderCardStanding> {
    await this.lock.lock(subject.id);
    const standing = await this.standings.ofOrder(subject.id);
    if (standing === null) {
      throw new OrderNotFoundError(subject.id);
    }
    return standing;
  }

  private async withIntent(
    subject: CardSubject,
  ): Promise<{ readonly standing: OrderCardStanding; readonly providerRef: string }> {
    const standing = await this.locked(subject);
    if (standing.providerRef === null) {
      throw new OrderCardSubjectWithoutIntentError(subject.id);
    }
    return { standing, providerRef: standing.providerRef };
  }
}

/**
 * Le premier paiement d'une commande : SON montant (plus le total, faux après
 * une hausse — plan S2, §2.5), et son règlement tel qu'elle le voit.
 */
function claimOf(standing: OrderCardStanding): SubjectClaim {
  return {
    subject: orderCardSubject(standing.orderId),
    amountCents: standing.firstPaymentCents,
    role: "first",
    settled: standing.settled,
  };
}
