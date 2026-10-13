import { refundPositionOf, type RefundStatus } from "../order-refund.js";
import {
  OrderRefundRequest,
  refundRequestStateOf,
  type RefundLedgerView,
} from "../order-refund-request.js";
import {
  RefundRequestAlreadyIssuedError,
  RefundRequestAmountError,
  RefundRequestNotFailedError,
} from "../../errors/order-refund-request-errors.js";

/**
 * La demande de remboursement (doc `documentation/commandes/annulation/annulation-par-le-staff.md`,
 * lot C4, C4.5, C4.7), pure. Les instants ne sont comparés qu'entre eux.
 */
const AT = new Date(Date.UTC(2030, 0, 10, 9));
const LATER = new Date(Date.UTC(2030, 0, 10, 9, 5));

function requested(announcedCents = 2_340): OrderRefundRequest {
  return OrderRefundRequest.request({
    orderId: "ord_1",
    cause: "cancellation",
    announcedCents,
    requestedAt: AT,
    requestedBy: "fiche-marie",
    firstAttemptAt: AT,
  });
}

function ledger(
  remainderCents: number,
  statuses: Record<string, RefundStatus> = {},
): RefundLedgerView {
  return { remainderCents, statusOf: (id) => statuses[id] ?? null };
}

describe("OrderRefundRequest.request — la factory", () => {
  it.each([0, -1, 12.5])("refuse un montant annoncé non positif ou non entier (%s)", (amount) => {
    expect(() => requested(amount)).toThrow(RefundRequestAmountError);
  });

  it("naît à la génération 1, round 1, sans essai, due dès sa demande, et s'insère", () => {
    const { state, expected } = requested().toPersistence();

    expect(state).toMatchObject({
      generation: 1,
      round: 1,
      attempts: 0,
      stripeRefundId: null,
      issuedAt: null,
      nextAttemptAt: AT,
      claimToken: null,
    });
    expect(expected).toBeNull();
  });
});

describe("OrderRefundRequest — la clé d'idempotence", () => {
  it("change avec le round, puis avec la génération", () => {
    const request = requested();
    const first = request.key();

    request.unavailable(AT, LATER);
    const second = request.key();
    request.issued("re_1", LATER);
    request.reopenAfterFailure("failed");

    expect(first).toBe("lfd-order-refund:ord_1:1:1");
    expect(second).toBe("lfd-order-refund:ord_1:1:2");
    expect(request.key()).toBe("lfd-order-refund:ord_1:2:1");
  });
});

describe("OrderRefundRequest.issued", () => {
  it("pose le re_… une fois ; le même id ensuite ne change rien", () => {
    const request = requested();

    expect(request.issued("re_1", LATER)).toBe(true);
    expect(request.issued("re_1", LATER)).toBe(false);
    expect(request.toPersistence().state).toMatchObject({
      stripeRefundId: "re_1",
      issuedAt: LATER,
      attempts: 1,
      nextAttemptAt: null,
      lastFailure: null,
    });
  });

  it("refuse un autre re_… pour la même génération", () => {
    const request = requested();
    request.issued("re_1", LATER);

    expect(() => request.issued("re_2", LATER)).toThrow(RefundRequestAlreadyIssuedError);
  });
});

describe("OrderRefundRequest.unavailable", () => {
  it("compte l'essai, ajoute un round, reporte l'échéance, et ne dit « premier » qu'une fois", () => {
    const request = requested();

    expect(request.unavailable(AT, LATER)).toBe(true);
    expect(request.unavailable(AT, LATER)).toBe(false);
    expect(request.toPersistence().state).toMatchObject({
      attempts: 2,
      round: 3,
      lastFailure: "unavailable",
      nextAttemptAt: LATER,
    });
  });
});

describe("OrderRefundRequest.stopped", () => {
  it("retire la demande du balayage : rejouer ne changerait rien", () => {
    const request = requested();

    request.stopped(LATER, "declined:charge_disputed");

    expect(request.toPersistence().state).toMatchObject({
      attempts: 1,
      lastFailure: "declined:charge_disputed",
      nextAttemptAt: null,
    });
  });
});

describe("OrderRefundRequest.reopenAfterFailure", () => {
  it.each<RefundStatus>(["failed", "canceled"])(
    "ouvre la génération suivante sur un re_… %s : round 1, sans re_…",
    (status) => {
      const request = requested();
      request.unavailable(AT, LATER);
      request.issued("re_1", LATER);

      request.reopenAfterFailure(status);

      expect(request.toPersistence().state).toMatchObject({
        generation: 2,
        round: 1,
        attempts: 0,
        stripeRefundId: null,
        issuedAt: null,
      });
    },
  );

  it.each<RefundStatus | null>(["pending", "requires_action", "succeeded", null])(
    "refuse sur un re_… %s",
    (status) => {
      const request = requested();
      request.issued("re_1", LATER);

      expect(() => request.reopenAfterFailure(status)).toThrow(RefundRequestNotFailedError);
    },
  );

  it("refuse sans re_…", () => {
    expect(() => requested().reopenAfterFailure("failed")).toThrow(RefundRequestNotFailedError);
  });
});

describe("OrderRefundRequest — le bail", () => {
  it("se lit à l'horloge murale, et l'écriture se conditionne à ce qui a été chargé", () => {
    const loaded = OrderRefundRequest.reconstitute({
      ...requested().toPersistence().state,
      claimedUntil: LATER,
      claimToken: "tok_1",
    });

    expect(loaded.isClaimedAt(AT)).toBe(true);
    expect(loaded.isClaimedAt(LATER)).toBe(false);
    expect(loaded.isHeldBy("tok_1")).toBe(true);
    loaded.release();
    expect(loaded.toPersistence()).toMatchObject({
      state: { claimedUntil: null, claimToken: null },
      expected: { generation: 1, claimToken: "tok_1" },
    });
  });
});

describe("refundRequestStateOf — l'état LU au carnet (C4.5)", () => {
  it.each<[string, string | null, RefundLedgerView, string]>([
    ["sans re_…, un reste à rendre", null, ledger(2_340), "to_issue"],
    ["sans re_…, le carnet dit tout rendu", null, ledger(0), "refunded"],
    ["re_… en attente", "re_1", ledger(2_340, { re_1: "pending" }), "issued"],
    ["re_… en action requise", "re_1", ledger(2_340, { re_1: "requires_action" }), "issued"],
    ["re_… pas encore au carnet", "re_1", ledger(2_340), "issued"],
    ["re_… réussi", "re_1", ledger(0, { re_1: "succeeded" }), "refunded"],
    ["re_… échoué", "re_1", ledger(2_340, { re_1: "failed" }), "failed"],
    ["re_… annulé", "re_1", ledger(2_340, { re_1: "canceled" }), "failed"],
  ])("%s → %s", (_, stripeRefundId, view, state) => {
    expect(refundRequestStateOf({ stripeRefundId }, view)).toBe(state);
  });
});

describe("refundPositionOf — le reste et ce qui est en vol (C4.4)", () => {
  it("ne retranche que les réussis, ne compte en vol que l'attente", () => {
    const refunds = [
      { amountCents: 500, status: "succeeded" as const },
      { amountCents: 300, status: "pending" as const },
      { amountCents: 200, status: "requires_action" as const },
      { amountCents: 700, status: "failed" as const },
      { amountCents: 100, status: "canceled" as const },
    ];

    expect(refundPositionOf(2_340, refunds)).toEqual({
      refundableCents: 1_840,
      inFlightCents: 500,
    });
  });

  it("ne descend jamais sous zéro", () => {
    expect(refundPositionOf(100, [{ amountCents: 500, status: "succeeded" }])).toEqual({
      refundableCents: 0,
      inFlightCents: 0,
    });
  });
});
