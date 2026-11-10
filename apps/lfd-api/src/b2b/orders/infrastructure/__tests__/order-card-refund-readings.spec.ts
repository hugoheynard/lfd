import type { SubjectRefundPosition } from "../../../../card-payment/channels/requests/index.js";
import { orderRefundPositionOf } from "../order-card-refund-readings.js";

/**
 * Ce que la règle de l'annulation lit de la position du bloc `card-payment`
 * (plan M2, §3.3, §6.2, lot P1.c) : le reste = encaissé − remboursé, et
 * l'argent en vol SAUF celui d'une `amount` (`refund_in_flight`).
 */
function position(overrides: Partial<SubjectRefundPosition> = {}): SubjectRefundPosition {
  return {
    subject: { type: "order", id: "ord_1" },
    chargedCents: 2_340,
    refundedCents: 0,
    refundedByNature: { return: 0, adjustment: 0, unattributed: 0 },
    inFlightByForm: { remainder: 0, amount: 0, unattributed: 0 },
    ...overrides,
  };
}

describe("orderRefundPositionOf", () => {
  it("le reste à rendre est l'encaissé moins le remboursé, toute nature", () => {
    expect(orderRefundPositionOf(position({ refundedCents: 340 }))).toEqual({
      refundableCents: 2_000,
      inFlightCents: 0,
    });
  });

  it("jamais négatif", () => {
    expect(orderRefundPositionOf(position({ refundedCents: 3_000 })).refundableCents).toBe(0);
  });

  it("l'argent en vol d'une `remainder` et d'un `re_…` sans demande compte, celui d'une `amount` non", () => {
    const inFlight = { remainder: 500, amount: 700, unattributed: 100 };

    expect(orderRefundPositionOf(position({ inFlightByForm: inFlight })).inFlightCents).toBe(600);
  });

  it("une commande sans paiement au bloc : rien à rendre", () => {
    expect(orderRefundPositionOf(position({ chargedCents: 0 }))).toEqual({
      refundableCents: 0,
      inFlightCents: 0,
    });
  });
});
