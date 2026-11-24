import { CardPaymentSettledFact } from "../../../../channels/facts/index.js";
import { RefundPaidPayLinkTest } from "../handlers/refund-paid-pay-link-test.handler.js";
import { RecordingCardRefunds } from "./pay-link-test-doubles.js";

/** Recopié dans le fait, jamais comparé à l'horloge. */
const PAID_AT = new Date("2026-03-02T10:00:00.000Z");

function delivery(subjectType: string) {
  const fact = new CardPaymentSettledFact(
    {
      paymentId: "pay_1",
      account: "lfc-stripe",
      providerRef: "pi_1",
      subjectType,
      subjectId: "plt_1",
      role: "first",
      amountCents: 100,
    },
    "applied",
    PAID_AT,
  ).durableFact();
  return { eventId: "evt_1", type: fact.type, payload: fact.payload };
}

describe("le remboursement automatique d'un essai payé", () => {
  it("demande le reste de tout l'essai, tout de suite, sans auteur", async () => {
    const refunds = new RecordingCardRefunds();
    await new RefundPaidPayLinkTest(refunds).handle(delivery("payment_test"));

    expect(refunds.remainders).toEqual([
      {
        target: { subject: { type: "payment_test", id: "plt_1" } },
        request: {
          nature: "return",
          reason: "pay_link_test",
          schedule: "now",
          requestedBy: null,
        },
      },
    ]);
  });

  it("ignore l'encaissement d'un autre sujet", async () => {
    const refunds = new RecordingCardRefunds();
    await new RefundPaidPayLinkTest(refunds).handle(delivery("order"));
    expect(refunds.remainders).toEqual([]);
  });
});
