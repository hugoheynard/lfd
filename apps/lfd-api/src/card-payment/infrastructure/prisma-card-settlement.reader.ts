import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { WallClock } from "../../platform/time/wall-clock.js";
import {
  type CardPaymentLine,
  type CardRefundRequestView,
  type CardRefundView,
  CardSettlementReader,
  type CardSettlementPosition,
  type SubjectCardRefundRequests,
  type SubjectCardRefunds,
  type SucceededCardRefund,
} from "../channels/requests/card-settlement.reader.js";
import type { CardSubject } from "../channels/subjects/index.js";
import type { CardPayment } from "../domain/entities/card-payment.js";
import type { CardRefundLine } from "../domain/entities/card-refund-ledger.js";
import type { CardRefundRequest } from "../domain/entities/card-refund-request.js";
import { CardRefundLedger } from "../domain/entities/card-refund-ledger.js";
import { PaymentSubject } from "../domain/value-objects/payment-subject.js";
import {
  anotherRemainderInProgress,
  refundableCentsOf,
} from "../domain/services/refund-siblings.js";
import { toDomain } from "./card-payment-rows.js";
import { lineOf, requestOf } from "./card-refund-rows.js";
import { byType, groupBy, positionFrom, subjectKey } from "./settlement-position.js";

/** Une ligne du carnet, avec le paiement qu'elle rembourse. */
interface PaymentRefund {
  readonly paymentId: string;
  readonly line: CardRefundLine;
}

/** Les lignes d'un lot de sujets, rangées par sujet. */
interface Batch {
  readonly payments: ReadonlyMap<string, CardPaymentLine[]>;
  readonly refunds: ReadonlyMap<string, PaymentRefund[]>;
  readonly requests: ReadonlyMap<string, CardRefundRequest[]>;
}

const EMPTY: Batch = { payments: new Map(), refunds: new Map(), requests: new Map() };

/**
 * **L'argent carte de sujets, par lot** (plan M2, §3.3) — trois requêtes pour
 * tous les sujets demandés : leurs paiements, puis le carnet et les demandes
 * de ces paiements. N'écrit jamais (§4.6). Par le client ambiant : appelé
 * dans une transaction (le canal, après l'écriture), il lit ce qu'elle vient
 * d'écrire.
 */
@Injectable()
export class PrismaCardSettlementReader extends CardSettlementReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wall: WallClock,
  ) {
    super();
  }

  async positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]> {
    const batch = await this.batchOf(subjects);
    return subjects.map((subject) => {
      const key = subjectKey(subject.type, subject.id);
      return positionFrom(subject, {
        payments: batch.payments.get(key) ?? [],
        refunds: (batch.refunds.get(key) ?? []).map((refund) => refund.line),
        requests: batch.requests.get(key) ?? [],
      });
    });
  }

  async remainderOf(paymentId: string): Promise<number> {
    const payment = await this.prisma.cardPayment.findUnique({ where: { id: paymentId } });
    if (payment === null) {
      return 0;
    }
    const [refunds, requests] = await Promise.all([
      this.prisma.cardRefund.findMany({ where: { paymentId } }),
      this.prisma.cardRefundRequest.findMany({ where: { paymentId } }),
    ]);
    const ledger = CardRefundLedger.rehydrate({
      paymentId,
      subject: PaymentSubject.of(payment.subjectType, payment.subjectId),
      account: payment.account,
      paymentRef: payment.providerRef,
      amountCents: payment.amountCents,
      paid: payment.state === "paid",
      lines: refunds.map(lineOf),
    });
    return refundableCentsOf(ledger, requests.map(requestOf));
  }

  async succeededRefundsOf(subject: CardSubject): Promise<readonly SucceededCardRefund[]> {
    const batch = await this.batchOf([subject]);
    return (batch.refunds.get(subjectKey(subject.type, subject.id)) ?? [])
      .filter(({ line }) => line.status === "succeeded")
      .map(({ paymentId, line }) => ({
        refundId: line.id,
        paymentId,
        amountCents: line.amountCents,
        nature: line.nature,
        source: line.source,
      }));
  }

  async refundsOf(subjects: readonly CardSubject[]): Promise<readonly SubjectCardRefunds[]> {
    const batch = await this.batchOf(subjects);
    return subjects.map((subject) => ({
      subject,
      refunds: (batch.refunds.get(subjectKey(subject.type, subject.id)) ?? []).map(refundViewOf),
    }));
  }

  async refundRequestsOf(
    subjects: readonly CardSubject[],
  ): Promise<readonly SubjectCardRefundRequests[]> {
    const batch = await this.batchOf(subjects);
    const wallNow = this.wall.elapsedNow();
    return subjects.map((subject) => {
      const requests = batch.requests.get(subjectKey(subject.type, subject.id)) ?? [];
      return {
        subject,
        requests: requests.map((request) => requestViewOf(request, requests, wallNow)),
      };
    });
  }

  private async batchOf(subjects: readonly CardSubject[]): Promise<Batch> {
    if (subjects.length === 0) {
      return EMPTY;
    }
    const payments = (
      await this.prisma.cardPayment.findMany({
        where: { OR: byType(subjects) },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      })
    ).map(toDomain);
    const subjectOf = new Map(
      payments.map((payment) => [payment.id, subjectKey(payment.subject.type, payment.subject.id)]),
    );
    const paymentIds = [...subjectOf.keys()];
    const [refunds, requests] = await Promise.all([
      this.prisma.cardRefund.findMany({
        where: { paymentId: { in: paymentIds } },
        orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
      }),
      this.prisma.cardRefundRequest.findMany({
        where: { paymentId: { in: paymentIds } },
        orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
      }),
    ]);
    return {
      payments: groupBy(payments.map(paymentLineOf), (line) => subjectOf.get(line.paymentId)),
      refunds: groupBy(
        refunds.map((row) => ({ paymentId: row.paymentId, line: lineOf(row) })),
        (refund) => subjectOf.get(refund.paymentId),
      ),
      requests: groupBy(requests.map(requestOf), (request) => subjectOf.get(request.paymentId)),
    };
  }
}

function paymentLineOf(payment: CardPayment): CardPaymentLine {
  return {
    paymentId: payment.id,
    account: payment.account.name,
    providerRef: payment.providerRef,
    role: payment.role,
    state: payment.state,
    amountCents: payment.amountCents,
    paidAt: payment.paidAt,
  };
}

function refundViewOf({ paymentId, line }: PaymentRefund): CardRefundView {
  return {
    refundId: line.id,
    paymentId,
    source: line.source,
    status: line.status,
    amountCents: line.amountCents,
    currency: line.currency,
    nature: line.nature,
    refundedAt: line.refundedAt,
    recordedAt: line.recordedAt,
  };
}

/** `retryable` : la règle de l'agrégat, sur les demandes sœurs du même paiement (§3.3, v14). */
function requestViewOf(
  request: CardRefundRequest,
  all: readonly CardRefundRequest[],
  wallNow: Date,
): CardRefundRequestView {
  const view = request.view;
  return {
    id: view.id,
    paymentId: view.paymentId,
    form: view.form,
    nature: view.nature,
    state: view.state,
    reason: view.reason,
    announcedCents: view.announcedCents,
    issuedCents: view.issuedCents,
    requestedAt: view.requestedAt,
    issuedAt: view.issuedAt,
    attempts: view.attempts,
    generation: view.generation,
    lastFailure: view.lastFailure,
    retryable: request.retryable(wallNow, anotherRemainderInProgress(request, all)),
  };
}

export { chargedOf } from "./settlement-position.js";
