import {
  type CardPaymentCancellation,
  type CardPaymentLine,
  type CardPaymentPreparation,
  CardPayments,
  type CardSettlementPosition,
  CardSettlementReader,
  type RetrievedCardPayment,
  type SubjectCardRefundRequests,
  type SubjectCardRefunds,
  type SucceededCardRefund,
} from "../../../../../payment/channels/requests/index.js";
import type { CardSubject } from "../../../../../payment/channels/subjects/index.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { PaymentLink } from "../../../domain/entities/payment-link.js";
import { PaymentLinkIntentNotCancelledError } from "../../../domain/errors/payment-link-errors.js";
import { PaymentLinkCancelledFact } from "../../../domain/events/payment-link-cancelled.fact.js";
import { PaymentLinkTerms } from "../../../domain/value-objects/payment-link-terms.js";
import {
  InMemoryPaymentLinks,
  KnownCompanies,
  RecordingNotifier,
} from "../../commands/__tests__/payment-link-doubles.js";
import { PaymentLinkBell } from "../../payment-link-bell.js";
import { OnPaymentLinkCancelled } from "../on-payment-link-cancelled.handler.js";

const AT = new Date(0);

/** La position d'une demande de paiement libre : son premier paiement, s'il existe. */
class FixedPositions extends CardSettlementReader {
  first: CardPaymentLine | null = null;
  readonly asked: CardSubject[] = [];

  positionOf(subjects: readonly CardSubject[]): Promise<readonly CardSettlementPosition[]> {
    this.asked.push(...subjects);
    return Promise.resolve(
      subjects.map((subject) => ({
        subject,
        chargedCents: 0,
        refundedCents: 0,
        refundedByNature: { return: 0, adjustment: 0, unattributed: 0 },
        inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
        payments: this.first === null ? [] : [this.first],
        openRequests: [],
      })),
    );
  }

  succeededRefundsOf(): Promise<readonly SucceededCardRefund[]> {
    return Promise.reject(new Error("non utilisé"));
  }

  refundsOf(): Promise<readonly SubjectCardRefunds[]> {
    return Promise.reject(new Error("non utilisé"));
  }

  refundRequestsOf(): Promise<readonly SubjectCardRefundRequests[]> {
    return Promise.reject(new Error("non utilisé"));
  }

  remainderOf(): Promise<number> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** Le canal des cartes, réduit à l'annulation ; son issue se règle. */
class ScriptedCancellation extends CardPayments {
  outcome: CardPaymentCancellation = { kind: "cancelled" };
  readonly cancelled: string[] = [];

  cancel(paymentId: string): Promise<CardPaymentCancellation> {
    this.cancelled.push(paymentId);
    return Promise.resolve(this.outcome);
  }

  prepare(): Promise<CardPaymentPreparation> {
    return Promise.reject(new Error("non utilisé"));
  }

  attach(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }

  release(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  retrieve(): Promise<RetrievedCardPayment> {
    return Promise.reject(new Error("non utilisé"));
  }

  settleFromProvider(): Promise<never> {
    return Promise.reject(new Error("non utilisé"));
  }

  adopt(): Promise<string> {
    return Promise.reject(new Error("non utilisé"));
  }
}

const FIRST: CardPaymentLine = {
  paymentId: "pay_1",
  account: "lfc-stripe",
  providerRef: "pi_1",
  role: "first",
  state: "pending",
  amountCents: 12_000,
  paidAt: null,
};

async function scene() {
  const links = new InMemoryPaymentLinks();
  await links.save(
    PaymentLink.create({
      id: "pl_1",
      companyId: "co_1",
      terms: PaymentLinkTerms.create(12_000, "Régularisation août", null),
      nature: "regularization",
      createdAt: AT,
      createdByStaffId: "staff_1",
    }),
  );
  const positions = new FixedPositions();
  const cards = new ScriptedCancellation();
  const notifier = new RecordingNotifier();
  const bell = new PaymentLinkBell(
    notifier,
    new KnownCompanies({ co_1: "Les Halles" }),
    new FixedClock(AT),
  );
  const handler = new OnPaymentLinkCancelled(positions, cards, links, bell);
  const fact = new PaymentLinkCancelledFact("pl_1").durableFact();
  const deliver = () =>
    handler.handle({ eventId: "out_1", type: fact.type, payload: fact.payload });
  return { positions, cards, notifier, deliver };
}

describe("OnPaymentLinkCancelled — l'intention suit l'annulation", () => {
  it("sans premier paiement, ne fait rien", async () => {
    const { positions, cards, deliver } = await scene();
    await deliver();
    expect(positions.asked).toEqual([{ type: "free_charge", id: "pl_1" }]);
    expect(cards.cancelled).toEqual([]);
  });

  it("annule le premier paiement chez le prestataire", async () => {
    const { positions, cards, notifier, deliver } = await scene();
    positions.first = FIRST;
    await deliver();
    expect(cards.cancelled).toEqual(["pay_1"]);
    expect(notifier.notices).toEqual([]);
  });

  it("déjà annulé : fini, sans erreur", async () => {
    const { positions, cards, deliver } = await scene();
    positions.first = FIRST;
    cards.outcome = { kind: "already_cancelled" };
    await expect(deliver()).resolves.toBeUndefined();
  });

  it("🔴 déjà payé : la cloche « payé après annulation » sonne, sans relancer", async () => {
    const { positions, cards, notifier, deliver } = await scene();
    positions.first = FIRST;
    cards.outcome = { kind: "already_paid" };
    await deliver();
    expect(cards.cancelled).toEqual(["pay_1"]);
    expect(notifier.notices).toEqual([
      expect.objectContaining({
        kind: "payment_link.paid_after_cancel",
        idempotencyKey: "notification:payment_link.paid_after_cancel:pl_1",
      }),
    ]);
  });

  it("une panne du prestataire lève : la boîte d'envoi rejoue", async () => {
    const { positions, cards, deliver } = await scene();
    positions.first = FIRST;
    cards.outcome = { kind: "unavailable", reason: "délai dépassé" };
    await expect(deliver()).rejects.toBeInstanceOf(PaymentLinkIntentNotCancelledError);
    cards.outcome = { kind: "in_progress" };
    await expect(deliver()).rejects.toBeInstanceOf(PaymentLinkIntentNotCancelledError);
  });
});
