import { collectionMeansAt, type PayerMeansEntry } from "../collection-means-timeline.js";
import { paris } from "./billing-mode-fixtures.js";

function entry(
  effectiveFrom: Date,
  means: PayerMeansEntry["means"],
  cancelled = false,
): PayerMeansEntry {
  return {
    id: effectiveFrom.toISOString(),
    effectiveFrom,
    means,
    reason: "motif",
    createdAt: paris("2026-09-01"),
    createdByStaffId: "s",
    cancelledAt: cancelled ? paris("2026-09-02") : null,
    cancelledByStaffId: cancelled ? "s" : null,
  };
}

describe("collectionMeansAt — le moyen d'un payeur à un instant", () => {
  it("sans segment : le prélèvement, jamais changé", () => {
    expect(collectionMeansAt([], paris("2026-10-08"))).toEqual({
      means: "sepa_debit",
      since: null,
    });
  });

  it("un segment vaut dès sa prise d'effet, pas avant", () => {
    const entries = [entry(paris("2026-11-01"), "bank_transfer")];
    expect(collectionMeansAt(entries, paris("2026-10-31", "23:59")).means).toBe("sepa_debit");
    expect(collectionMeansAt(entries, paris("2026-11-01"))).toEqual({
      means: "bank_transfer",
      since: paris("2026-11-01"),
    });
  });

  it("le dernier segment pris d'effet fait foi ; un annulé ne compte pas", () => {
    const entries = [
      entry(paris("2026-09-01"), "bank_transfer"),
      entry(paris("2026-10-01"), "sepa_debit", true),
    ];
    expect(collectionMeansAt(entries, paris("2026-10-08")).means).toBe("bank_transfer");
  });
});
