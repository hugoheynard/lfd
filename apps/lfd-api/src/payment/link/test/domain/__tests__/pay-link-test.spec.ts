import { PAY_LINK_TEST_DAILY_LIMIT } from "@lfd/contracts";

import {
  InvalidPayLinkTestError,
  PayLinkTestDailyLimitError,
} from "../errors/pay-link-test-errors.js";
import {
  assertDailyRoom,
  PAY_LINK_TEST_AMOUNT_CENTS,
  PAY_LINK_TEST_PAYABLE_MS,
  PayLinkTest,
} from "../pay-link-test.js";

/** Les instants ne sont comparés qu'entre eux : `SENT` n'est jamais lu contre le mur. */
const SENT = new Date("2026-03-02T10:00:00.000Z");
const LATER = new Date(SENT.getTime() + 60_000);

function sent(): PayLinkTest {
  return PayLinkTest.send({ id: "plt_1", createdAt: SENT, createdByStaffId: "staff_1" });
}

describe("l'essai du paiement par lien", () => {
  it("naît envoyé, à 1 €, sans instant de paiement", () => {
    expect(sent().toPersistence()).toEqual({
      id: "plt_1",
      amountCents: 100,
      state: "sent",
      createdAt: SENT,
      createdByStaffId: "staff_1",
      paidAt: null,
      refundedAt: null,
    });
    expect(PAY_LINK_TEST_AMOUNT_CENTS).toBe(100);
  });

  it("refuse un auteur vide", () => {
    expect(() =>
      PayLinkTest.send({ id: "plt_1", createdAt: SENT, createdByStaffId: "  " }),
    ).toThrow(InvalidPayLinkTestError);
  });

  it("se paie pendant 24 heures, puis se dit expiré", () => {
    const test = sent();
    const edge = new Date(SENT.getTime() + PAY_LINK_TEST_PAYABLE_MS);
    expect(test.isPayableAt(new Date(edge.getTime() - 1))).toBe(true);
    expect(test.isPayableAt(edge)).toBe(false);
    expect(test.isExpiredAt(edge)).toBe(true);
  });

  it("payé : plus payable ni expiré ; le même paiement rejoué ne change rien", () => {
    const test = sent();
    expect(test.markPaid(LATER)).toBe("applied");
    expect(test.markPaid(new Date(LATER.getTime() + 1))).toBe("already_applied");
    expect(test.paidAt).toEqual(LATER);
    const past = new Date(SENT.getTime() + 2 * PAY_LINK_TEST_PAYABLE_MS);
    expect(test.isPayableAt(past)).toBe(false);
    expect(test.isExpiredAt(past)).toBe(false);
  });

  it("remboursé une fois ; un second constat ne réécrit rien", () => {
    const test = sent();
    test.markPaid(LATER);
    expect(test.markRefunded(LATER)).toBe(true);
    expect(test.markRefunded(new Date(LATER.getTime() + 5))).toBe(false);
    expect(test.toPersistence()).toMatchObject({ state: "refunded", refundedAt: LATER });
  });

  it("un remboursement échoué, puis réussi à la relance", () => {
    const test = sent();
    test.markPaid(LATER);
    expect(test.markRefundFailed()).toBe(true);
    expect(test.markRefundFailed()).toBe(false);
    expect(test.markRefunded(LATER)).toBe(true);
    expect(test.state).toBe("refunded");
  });

  it("un euro rendu qui revient : l'essai repasse en échec et perd son instant", () => {
    const test = sent();
    test.markPaid(LATER);
    test.markRefunded(LATER);
    expect(test.markRefundFailed()).toBe(true);
    expect(test.toPersistence()).toMatchObject({ state: "refund_failed", refundedAt: null });
  });

  it("refuse de rembourser un essai jamais payé", () => {
    expect(() => sent().markRefunded(LATER)).toThrow(InvalidPayLinkTestError);
    expect(() => sent().markRefundFailed()).toThrow(InvalidPayLinkTestError);
  });

  it("relit une ligne cohérente, refuse un autre montant ou des instants décalés", () => {
    const row = sent().toPersistence();
    expect(PayLinkTest.rehydrate(row).state).toBe("sent");
    expect(() => PayLinkTest.rehydrate({ ...row, amountCents: 200 })).toThrow(
      InvalidPayLinkTestError,
    );
    expect(() => PayLinkTest.rehydrate({ ...row, state: "paid" })).toThrow(InvalidPayLinkTestError);
    expect(() =>
      PayLinkTest.rehydrate({ ...row, state: "paid", paidAt: LATER, refundedAt: LATER }),
    ).toThrow(InvalidPayLinkTestError);
  });
});

describe("le plafond du jour", () => {
  it(`admet jusqu'au ${String(PAY_LINK_TEST_DAILY_LIMIT)}ᵉ essai, refuse le suivant`, () => {
    expect(() => assertDailyRoom(PAY_LINK_TEST_DAILY_LIMIT - 1)).not.toThrow();
    expect(() => assertDailyRoom(PAY_LINK_TEST_DAILY_LIMIT)).toThrow(PayLinkTestDailyLimitError);
  });
});
