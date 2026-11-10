import {
  cardRefundRequest,
  FixedCardRefundRequests,
} from "../../commands/__tests__/refund-doubles.js";
import { AdminOrderRefundView } from "../admin-order-refund-view.js";

/**
 * Le bandeau des remboursements au détail staff (plan M2, §3.3, §5.3, lot
 * P1.c) : TOUTES les demandes du bloc, terminées comprises, dans la forme du
 * contrat — le code brut du dernier échec devenu la phrase du commerce, et
 * `retryable` recopié tel que le bloc le calcule (bail compris).
 */
describe("AdminOrderRefundView", () => {
  it("rend chaque demande du bloc, champ à champ, instants en ISO", async () => {
    const issuedAt = new Date(Date.UTC(2030, 0, 11, 9));
    const view = new AdminOrderRefundView(
      new FixedCardRefundRequests([
        cardRefundRequest({
          id: "req_1",
          state: "refunded",
          issuedCents: 2_340,
          issuedAt,
          attempts: 1,
        }),
        cardRefundRequest({
          id: "req_2",
          paymentId: "pay_2",
          state: "stopped",
          generation: 2,
          attempts: 1,
          lastFailure: "declined:expired_card",
          retryable: true,
        }),
      ]),
    );

    const requests = await view.of("ord_1");

    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({
      id: "req_1",
      paymentId: "pay_1",
      form: "remainder",
      nature: "return",
      reason: "cancellation",
      state: "refunded",
      announcedCents: 2_340,
      issuedCents: 2_340,
      requestedAt: "2030-01-10T09:00:00.000Z",
      issuedAt: issuedAt.toISOString(),
      attempts: 1,
      generation: 1,
      lastFailure: null,
      retryable: false,
    });
    expect(requests[1]).toMatchObject({
      id: "req_2",
      paymentId: "pay_2",
      state: "stopped",
      generation: 2,
      retryable: true,
    });
    expect(requests[1]?.lastFailure).toContain("Stripe a refusé le remboursement (expired_card)");
  });

  it("aucune demande : une liste vide, jamais `null`", async () => {
    await expect(
      new AdminOrderRefundView(new FixedCardRefundRequests()).of("ord_1"),
    ).resolves.toEqual([]);
  });
});
