import { RefundRejectedError } from "../../errors/order-refund-errors.js";
import {
  OrderRefundLedger,
  type LedgerPaymentStatus,
  type RefundRecording,
} from "../order-refund-ledger.js";
import type { RefundReport, RefundStatus } from "../order-refund.js";

/**
 * Les instants ne sont comparés qu'entre eux, jamais à l'horloge : le carnet
 * ne lit aucun « maintenant », il recopie l'instant qu'on lui donne.
 */
const STRIPE_AT = new Date("2030-01-10T09:00:00.000Z");
const SEEN_AT = new Date("2030-01-10T09:00:05.000Z");
const LATER = new Date("2030-01-11T10:00:00.000Z");

const CHARGED = 2_000;

function ledger(paymentStatus: LedgerPaymentStatus = "paid"): OrderRefundLedger {
  return OrderRefundLedger.reconstitute({
    orderId: "ord_1",
    orderNumber: "CMD-1",
    chargedCents: CHARGED,
    paymentStatus,
    refunds: [],
  });
}

function report(
  status: RefundStatus,
  amountCents: number,
  stripeRefundId = "re_1",
  currency = "eur",
): RefundReport {
  return { stripeRefundId, amountCents, currency, status, refundedAt: STRIPE_AT };
}

type Recorded = Extract<RefundRecording, { kind: "recorded" }>;

function recorded(outcome: RefundRecording): Recorded {
  expect(outcome.kind).toBe("recorded");
  return outcome as Recorded;
}

function rejection(act: () => unknown): string {
  try {
    act();
  } catch (error) {
    if (error instanceof RefundRejectedError) {
      return error.reason;
    }
    throw error;
  }
  return "aucun refus";
}

describe("OrderRefundLedger — constater", () => {
  it("note un remboursement nouveau, à l'instant Stripe, constaté au nôtre", () => {
    const book = ledger();

    const outcome = recorded(book.record(report("succeeded", 500), "ref_1", SEEN_AT));

    expect(outcome.refund).toEqual({
      id: "ref_1",
      stripeRefundId: "re_1",
      amountCents: 500,
      currency: "eur",
      status: "succeeded",
      refundedAt: STRIPE_AT,
      recordedAt: SEEN_AT,
      updatedAt: SEEN_AT,
      creditNoteId: null,
    });
    expect(outcome.refundedCents).toBe(500);
  });

  it("un rejeu ne double rien : même identifiant, même statut, rien ne change", () => {
    const book = ledger();
    book.record(report("succeeded", 500), "ref_1", SEEN_AT);

    expect(book.record(report("succeeded", 500), "ref_2", LATER)).toEqual({ kind: "unchanged" });
    expect(book.toPersistence().refunds).toHaveLength(1);
    expect(book.refundedCents()).toBe(500);
  });

  it("un remboursement en attente est noté, mais ne compte pas dans le cumul", () => {
    const book = ledger();

    const outcome = recorded(book.record(report("pending", 500), "ref_1", SEEN_AT));

    expect(outcome.refundedCents).toBe(0);
    expect(outcome.settlement).toBe("unchanged");
  });

  it("passe de l'attente à la réussite sur le même identifiant, sans nouvelle ligne", () => {
    const book = ledger();
    book.record(report("pending", 500), "ref_1", SEEN_AT);

    const outcome = recorded(book.record(report("succeeded", 500), "ref_2", LATER));

    expect(outcome.refund).toMatchObject({ id: "ref_1", recordedAt: SEEN_AT, updatedAt: LATER });
    expect(book.toPersistence().refunds).toHaveLength(1);
  });
});

describe("OrderRefundLedger — un statut ne régresse pas", () => {
  it("un `pending` arrivé après la réussite est périmé, pas appliqué", () => {
    const book = ledger();
    book.record(report("succeeded", 500), "ref_1", SEEN_AT);

    expect(book.record(report("pending", 500), "ref_2", LATER)).toEqual({ kind: "unchanged" });
    expect(book.refundedCents()).toBe(500);
  });

  it("un échec terminal ne revient pas en attente", () => {
    const book = ledger();
    book.record(report("failed", 500), "ref_1", SEEN_AT);

    expect(book.record(report("pending", 500), "ref_2", LATER)).toEqual({ kind: "unchanged" });
  });

  it("refuse qu'un remboursement réussi se dise annulé : Stripe ne l'annule qu'en attente", () => {
    const book = ledger();
    book.record(report("succeeded", 500), "ref_1", SEEN_AT);

    expect(rejection(() => book.record(report("canceled", 500), "ref_2", LATER))).toBe(
      "reversed_after_success",
    );
    expect(book.refundedCents()).toBe(500);
  });

  it("refuse un remboursement connu qui revient avec un autre montant", () => {
    const book = ledger();
    book.record(report("pending", 500), "ref_1", SEEN_AT);

    expect(rejection(() => book.record(report("succeeded", 600), "ref_2", LATER))).toBe(
      "amount_changed",
    );
  });
});

describe("OrderRefundLedger — devise et plafond", () => {
  it("refuse une devise étrangère, sans rien écrire", () => {
    const book = ledger();

    expect(
      rejection(() => book.record(report("succeeded", 500, "re_1", "usd"), "r", SEEN_AT)),
    ).toBe("currency");
    expect(book.toPersistence().refunds).toHaveLength(0);
  });

  it("refuse le remboursement qui ferait dépasser le total encaissé, sans rien écrire", () => {
    const book = ledger();
    book.record(report("succeeded", 1_500, "re_1"), "ref_1", SEEN_AT);

    expect(rejection(() => book.record(report("succeeded", 600, "re_2"), "ref_2", LATER))).toBe(
      "exceeds_charge",
    );
    expect(book.toPersistence().refunds).toHaveLength(1);
    expect(book.paymentStatus).toBe("paid");
  });

  it("admet un remboursement en attente au-delà du reste : seul le réussi compte", () => {
    const book = ledger();
    book.record(report("succeeded", 1_500, "re_1"), "ref_1", SEEN_AT);

    expect(book.record(report("pending", 600, "re_2"), "ref_2", LATER).kind).toBe("recorded");
  });
});

describe("OrderRefundLedger — le règlement suit le cumul", () => {
  it("un remboursement partiel laisse la commande payée", () => {
    const book = ledger();

    const outcome = recorded(book.record(report("succeeded", 500), "ref_1", SEEN_AT));

    expect(outcome.settlement).toBe("unchanged");
    expect(book.paymentStatus).toBe("paid");
  });

  it("le remboursement qui atteint le total passe la commande à `refunded`", () => {
    const book = ledger();
    book.record(report("succeeded", 500, "re_1"), "ref_1", SEEN_AT);

    const outcome = recorded(book.record(report("succeeded", 1_500, "re_2"), "ref_2", LATER));

    expect(outcome).toMatchObject({ refundedCents: CHARGED, settlement: "fully_refunded" });
    expect(book.toPersistence().paymentStatus).toBe("refunded");
  });

  it("un remboursement réussi qui échoue ensuite rend la commande `paid`", () => {
    const book = ledger();
    book.record(report("succeeded", CHARGED), "ref_1", SEEN_AT);

    const outcome = recorded(book.record(report("failed", CHARGED), "ref_2", LATER));

    expect(outcome).toMatchObject({ refundedCents: 0, settlement: "restored" });
    expect(book.paymentStatus).toBe("paid");
  });

  it("ne touche pas au règlement d'une commande annulée encaissée après coup (`failed`)", () => {
    const book = ledger("failed");

    const outcome = recorded(book.record(report("succeeded", CHARGED), "ref_1", SEEN_AT));

    expect(outcome.settlement).toBe("unchanged");
    expect(book.paymentStatus).toBe("failed");
  });
});
