import { settlementRegimeOf } from "../settlement-regime.js";

describe("settlementRegimeOf", () => {
  it("une commande différée et non nulle est au compte", () => {
    expect(settlementRegimeOf("not_required", 1250)).toBe("account");
  });
  it("une commande à total nul est gratuite, pas au compte", () => {
    expect(settlementRegimeOf("not_required", 0)).toBe("free");
  });
  it.each(["pending", "failed"] as const)("un règlement %s est dû", (status) => {
    expect(settlementRegimeOf(status, 1250)).toBe("due");
  });
  it.each(["paid", "refunded"] as const)("un règlement %s a été payé", (status) => {
    expect(settlementRegimeOf(status, 1250)).toBe("paid");
  });
});
