import { CARD_REFUND_STATUSES, cardRefundStatusMove, oneOfValues } from "../card-refund-values.js";

/**
 * Le carnet ne régresse pas (§3.4) — la même table que le déclencheur
 * `card_payment.refund_guard` (relu le 2026-11-10 dans
 * `20261110010100_le_remboursement_par_carte`) : ce que la base refuse, le code
 * ne le tente jamais ; ce qu'elle admet et qui recule, le code l'ignore.
 */
describe("cardRefundStatusMove", () => {
  const APPLIED = new Set([
    "pending>requires_action",
    "pending>succeeded",
    "pending>failed",
    "pending>canceled",
    "requires_action>pending",
    "requires_action>succeeded",
    "requires_action>failed",
    "requires_action>canceled",
    "succeeded>failed",
  ]);

  it.each(
    CARD_REFUND_STATUSES.flatMap((from) => CARD_REFUND_STATUSES.map((to) => [from, to] as const)),
  )("%s → %s", (from, to) => {
    const move = cardRefundStatusMove(from, to);
    if (APPLIED.has(`${from}>${to}`)) {
      expect(move).toBe("apply");
    } else if (from === "succeeded" && to === "canceled") {
      expect(move).toBe("illegal");
    } else {
      expect(move).toBe("stale");
    }
  });
});

describe("oneOfValues", () => {
  it("rend la valeur connue, `null` sinon", () => {
    expect(oneOfValues(CARD_REFUND_STATUSES, "succeeded")).toBe("succeeded");
    expect(oneOfValues(CARD_REFUND_STATUSES, "disputed")).toBeNull();
  });
});
