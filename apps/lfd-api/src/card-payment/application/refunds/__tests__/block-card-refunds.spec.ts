import { CardPaymentNotFoundError } from "../../../domain/errors/card-payment-errors.js";
import {
  CardRefundAmountExceedsRemainderError,
  CardRefundNothingLeftError,
  CardRefundPaymentNotPaidError,
  CardRefundRequestNotFoundError,
  CardRefundRetryRefusedError,
} from "../../../domain/errors/card-refund-errors.js";
import type { RemainderRefundRequest } from "../../../channels/requests/card-refunds.js";
import {
  CHARGED,
  NOW,
  ORDER,
  refundHarness,
  seedLine,
  seedPayment,
  seedRequest,
} from "./card-refund-harness.js";

const NOW_REQUEST: RemainderRefundRequest = {
  nature: "return",
  reason: "cancellation",
  schedule: "now",
  requestedBy: "staff_1",
};

/**
 * **`CardRefunds`** (plan M2, §3.3) — dans la transaction de l'appelant : le
 * sujet et le paiement verrouillés d'abord, les refus décidés AVANT d'écrire,
 * l'exécuteur lancé après validation.
 */
describe("CardRefunds.requestRemainder — un paiement", () => {
  it("crée une `remainder` à émettre, qui annonce le reste ; l'exécuteur part après validation", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedLine(h, { status: "succeeded", amountCents: 340 });

    const [made] = await h.refunds.requestRemainder({ paymentId: "pay_1" }, NOW_REQUEST);

    expect(made).toMatchObject({
      paymentId: "pay_1",
      form: "remainder",
      announcedCents: 2_000,
      state: "to_issue",
    });
    expect(h.store.request(made?.requestId ?? "")).toMatchObject({
      nature: "return",
      reason: "cancellation",
      requestedBy: "staff_1",
      nextAttemptAt: NOW,
    });
    expect(h.dispatch.afterCommit).toEqual([made?.requestId]);
    expect(h.timeline.steps.slice(0, 2)).toEqual([
      "channel.lockSubject:ord_1",
      "payment.lock:pay_1",
    ]);
  });

  it("idempotent : rend la `remainder` EN COURS du paiement, n'en crée pas une seconde", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h);

    const [made] = await h.refunds.requestRemainder({ paymentId: "pay_1" }, NOW_REQUEST);

    expect(made?.requestId).toBe("req_1");
    expect(h.store.requests.size).toBe(1);
    expect(h.dispatch.afterCommit).toEqual([]);
  });

  it("`button` rend la `stopped` existante, laissée telle quelle", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { firstAttemptAt: null });

    const [made] = await h.refunds.requestRemainder(
      { paymentId: "pay_1" },
      { ...NOW_REQUEST, schedule: "button" },
    );

    expect(made).toMatchObject({ requestId: "req_1", state: "stopped" });
    expect(h.store.requests.size).toBe(1);
  });

  it("`now` à côté d'une `stopped` : en crée une neuve — la `stopped` reste, le bouton la relancera", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { firstAttemptAt: null });

    const [made] = await h.refunds.requestRemainder({ paymentId: "pay_1" }, NOW_REQUEST);

    expect(made?.requestId).not.toBe("req_1");
    expect(h.store.requests.size).toBe(2);
  });

  it("le reste annoncé retranche ce que les `amount` non terminales annoncent déjà (§7)", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { id: "req_amount", form: "amount", amountCents: 500, announcedCents: 500 });

    const [made] = await h.refunds.requestRemainder({ paymentId: "pay_1" }, NOW_REQUEST);

    expect(made?.announcedCents).toBe(CHARGED - 500);
  });

  it.each<[string, () => ReturnType<typeof refundHarness>, new (...args: never[]) => Error]>([
    ["un paiement inconnu", () => refundHarness(), CardPaymentNotFoundError],
    [
      "un paiement jamais encaissé",
      () => {
        const h = refundHarness();
        seedPayment(h, "pending");
        return h;
      },
      CardRefundPaymentNotPaidError,
    ],
    [
      "un paiement déjà tout rendu",
      () => {
        const h = refundHarness();
        seedPayment(h);
        seedLine(h, { status: "succeeded" });
        return h;
      },
      CardRefundNothingLeftError,
    ],
  ])("refuse %s AVANT d'écrire", async (_, make, refusal) => {
    const h = make();

    await expect(
      h.refunds.requestRemainder({ paymentId: "pay_1" }, NOW_REQUEST),
    ).rejects.toBeInstanceOf(refusal);
    expect(h.store.requests.size).toBe(0);
  });
});

describe("CardRefunds.requestRemainder — un sujet (§3.3, v9)", () => {
  it("une `remainder` par paiement ENCAISSÉ qui a un reste, du dernier au premier", async () => {
    const h = refundHarness();
    seedPayment(h, "paid", { id: "pay_1", providerRef: "pi_1" });
    seedPayment(h, "paid", { id: "pay_2", providerRef: "pi_2", amountCents: 700 });
    seedPayment(h, "pending", { id: "pay_3", providerRef: "pi_3", amountCents: 900 });

    const made = await h.refunds.requestRemainder({ subject: ORDER }, NOW_REQUEST);

    expect(made.map((request) => [request.paymentId, request.announcedCents])).toEqual([
      ["pay_2", 700],
      ["pay_1", CHARGED],
    ]);
  });

  it("un sujet sans paiement encaissé : aucune demande, aucun refus", async () => {
    const h = refundHarness();
    seedPayment(h, "pending");

    await expect(h.refunds.requestRemainder({ subject: ORDER }, NOW_REQUEST)).resolves.toEqual([]);
  });
});

describe("CardRefunds.requestAmount", () => {
  it("crée une `amount` à émettre tout de suite", async () => {
    const h = refundHarness();
    seedPayment(h);

    const made = await h.refunds.requestAmount({
      paymentId: "pay_1",
      amountCents: 500,
      nature: "adjustment",
      reason: "revision",
      requestedBy: null,
    });

    expect(made).toMatchObject({ form: "amount", announcedCents: 500, state: "to_issue" });
    expect(h.dispatch.afterCommit).toEqual([made.requestId]);
  });

  it("refuse un montant au-delà du reste — la `remainder` en cours compte (G2)", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { announcedCents: 2_000 });

    await expect(
      h.refunds.requestAmount({
        paymentId: "pay_1",
        amountCents: 341,
        nature: "adjustment",
        reason: "revision",
        requestedBy: null,
      }),
    ).rejects.toBeInstanceOf(CardRefundAmountExceedsRemainderError);
    expect(h.store.requests.size).toBe(1);
  });
});

describe("CardRefunds.retry — « Relancer » (§3.4)", () => {
  it("une `stopped` repart : génération + 1, `card_payment.retried`, l'exécuteur après validation", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { firstAttemptAt: null });

    await h.refunds.retry("req_1");

    expect(h.store.request("req_1")).toMatchObject({
      state: "to_issue",
      generation: 2,
      nextAttemptAt: NOW,
    });
    expect(h.journal.facts).toEqual([
      {
        type: "card_payment.retried",
        subjectType: "card_payment",
        subjectId: "req_1",
        payload: { subjectLabel: "Commande ord_1", generation: 2 },
      },
    ]);
    expect(h.dispatch.afterCommit).toEqual(["req_1"]);
    expect(h.timeline.steps.slice(0, 3)).toEqual([
      "channel.lockSubject:ord_1",
      "payment.lock:pay_1",
      "request.load:req_1",
    ]);
  });

  it("refusée quand une autre `remainder` du paiement est en cours : rien d'écrit", async () => {
    const h = refundHarness();
    seedPayment(h);
    seedRequest(h, { id: "req_old", firstAttemptAt: null });
    seedRequest(h, { id: "req_live" });

    await expect(h.refunds.retry("req_old")).rejects.toBeInstanceOf(CardRefundRetryRefusedError);
    expect(h.store.request("req_old")?.state).toBe("stopped");
    expect(h.journal.facts).toEqual([]);
  });

  it("une demande inconnue : 404", async () => {
    const h = refundHarness();

    await expect(h.refunds.retry("req_absente")).rejects.toBeInstanceOf(
      CardRefundRequestNotFoundError,
    );
  });
});
