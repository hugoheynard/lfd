import type { CardPaymentLine } from "../../channels/requests/card-settlement.reader.js";
import type { CardRefundLine } from "../../domain/entities/card-refund-ledger.js";
import { CardRefundRequest } from "../../domain/entities/card-refund-request.js";
import { positionFrom } from "../settlement-position.js";

/** Les instants ne sont comparés à rien. */
const AT = new Date("2030-01-10T09:00:00.000Z");
const SUBJECT = { type: "order", id: "ord_1" } as const;

function payment(overrides: Partial<CardPaymentLine> = {}): CardPaymentLine {
  return {
    paymentId: "pay_1",
    account: "lfc-stripe",
    providerRef: "pi_1",
    role: "first",
    state: "paid",
    amountCents: 2_000,
    paidAt: AT,
    ...overrides,
  };
}

function line(overrides: Partial<CardRefundLine>): CardRefundLine {
  return {
    id: "ref_1",
    requestId: null,
    nature: null,
    source: "provider",
    providerRef: "re_1",
    amountCents: 100,
    currency: "eur",
    status: "succeeded",
    refundedAt: AT,
    recordedAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function request(id: string, form: "remainder" | "amount", firstAttemptAt: Date | null) {
  return CardRefundRequest.request({
    id,
    paymentId: "pay_1",
    form,
    amountCents: form === "amount" ? 300 : null,
    nature: form === "amount" ? "adjustment" : "return",
    reason: "cancellation",
    announcedCents: 300,
    requestedAt: AT,
    requestedBy: null,
    firstAttemptAt,
  });
}

/**
 * **La position d'un sujet** (plan M2, §3.3) — une seule arithmétique :
 * l'encaissé, le remboursé par nature, l'en-vol par forme, les demandes
 * non terminales.
 */
describe("positionFrom", () => {
  it("encaissé = Σ des paiements `paid` ; un `pending` n'y compte pas", () => {
    const position = positionFrom(SUBJECT, {
      payments: [payment(), payment({ paymentId: "pay_2", state: "pending", amountCents: 500 })],
      refunds: [],
      requests: [],
    });

    expect(position.chargedCents).toBe(2_000);
    expect(position.refundedCents).toBe(0);
  });

  it("remboursé par nature — un `re_…` sans demande compte au total, sans nature", () => {
    const position = positionFrom(SUBJECT, {
      payments: [payment()],
      refunds: [
        line({ id: "a", nature: "return", amountCents: 100 }),
        line({ id: "b", nature: "adjustment", amountCents: 200 }),
        line({ id: "c", nature: null, amountCents: 50 }),
        line({ id: "d", nature: "return", amountCents: 999, status: "failed" }),
      ],
      requests: [],
    });

    expect(position.refundedCents).toBe(350);
    expect(position.refundedByNature).toEqual({ return: 100, adjustment: 200, unattributed: 50 });
  });

  it("en vol par forme de la demande qui l'a émis (l'annulation ignore les `amount`, §6.2)", () => {
    const position = positionFrom(SUBJECT, {
      payments: [payment()],
      refunds: [
        line({ id: "a", status: "pending", requestId: "req_r", amountCents: 100 }),
        line({ id: "b", status: "requires_action", requestId: "req_a", amountCents: 300 }),
        line({ id: "c", status: "pending", requestId: null, amountCents: 40 }),
      ],
      requests: [request("req_r", "remainder", AT), request("req_a", "amount", AT)],
    });

    expect(position.inFlightByForm).toEqual({ remainder: 100, amount: 300, unattributed: 40 });
  });

  it("les demandes non terminales : `to_issue`, `issued`, `stopped` — jamais `refunded`", () => {
    const refunded = CardRefundRequest.rehydrate({
      ...request("req_done", "remainder", AT).view,
      state: "refunded",
    });

    const position = positionFrom(SUBJECT, {
      payments: [payment()],
      refunds: [],
      requests: [
        request("req_live", "remainder", AT),
        request("req_wait", "amount", null),
        refunded,
      ],
    });

    expect(position.openRequests).toEqual([
      {
        requestId: "req_live",
        paymentId: "pay_1",
        form: "remainder",
        nature: "return",
        state: "to_issue",
      },
      {
        requestId: "req_wait",
        paymentId: "pay_1",
        form: "amount",
        nature: "adjustment",
        state: "stopped",
      },
    ]);
  });
});
