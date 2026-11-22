import {
  CardPaymentCheckoutEvent,
  CardPaymentFactPayloadError,
  CardPaymentFailedFact,
  CardPaymentSettledFact,
  CardPaymentUnmatchedFact,
  type ProviderRefund,
} from "../index.js";

/** Comparée à elle-même seulement, après un aller-retour par la charge. */
const AT = new Date("2030-01-10T09:00:00.000Z");

const PAYMENT = {
  paymentId: "pay_1",
  account: "lfc-stripe",
  providerRef: "pi_1",
  subjectType: "order",
  subjectId: "ord_1",
  role: "first" as const,
  amountCents: 2_340,
};

const REFUND: ProviderRefund = {
  refundId: "re_1",
  amountCents: 1_000,
  currency: "eur",
  status: "pending",
  refundedAt: AT,
};

/** Une charge telle que la boîte d'envoi la rend : passée par du JSON. */
function throughJson(
  payload: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(JSON.stringify(payload));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("charge illisible");
  }
  return Object.fromEntries(Object.entries(parsed));
}

describe("les faits de card-payment — aller-retour par la boîte d'envoi", () => {
  it("settled", () => {
    const fact = new CardPaymentSettledFact(PAYMENT, "refused", AT);
    expect(CardPaymentSettledFact.fromPayload(throughJson(fact.durableFact().payload))).toEqual(
      fact,
    );
  });

  it("failed", () => {
    const fact = new CardPaymentFailedFact(PAYMENT);
    expect(CardPaymentFailedFact.fromPayload(throughJson(fact.durableFact().payload))).toEqual(
      fact,
    );
  });

  it("checkout_event", () => {
    const fact = new CardPaymentCheckoutEvent(
      "lfc-stripe",
      "evt_1",
      "checkout.session.expired",
      "expired",
      "cs_1",
    );
    expect(CardPaymentCheckoutEvent.fromPayload(throughJson(fact.durableFact().payload))).toEqual(
      fact,
    );
  });

  it.each([
    ["avec remboursement", "pi_1", REFUND],
    ["sans intention ni remboursement", null, null],
  ] as const)("unmatched %s", (_, providerRef, refund) => {
    const fact = new CardPaymentUnmatchedFact(
      "lfc-stripe",
      "evt_1",
      "refund.updated",
      providerRef,
      refund,
    );
    expect(CardPaymentUnmatchedFact.fromPayload(throughJson(fact.durableFact().payload))).toEqual(
      fact,
    );
  });

  it("refuse une charge hors forme en nommant le champ", () => {
    expect(() =>
      CardPaymentSettledFact.fromPayload({
        ...PAYMENT,
        outcome: "maybe",
        paidAt: AT.toISOString(),
      }),
    ).toThrow(CardPaymentFactPayloadError);
    expect(() => CardPaymentFailedFact.fromPayload({ ...PAYMENT, amountCents: "12" })).toThrow(
      /amountCents/u,
    );
  });

  it("les clés : une par paiement, une par événement du prestataire", () => {
    expect(new CardPaymentSettledFact(PAYMENT, "applied", AT).durableFact().key).toBe(
      "card_payment.settled:pay_1",
    );
    expect(
      new CardPaymentUnmatchedFact("lfc-stripe", "evt_9", "x", null, null).durableFact().key,
    ).toBe("card_payment.unmatched:lfc-stripe:evt_9");
  });
});
