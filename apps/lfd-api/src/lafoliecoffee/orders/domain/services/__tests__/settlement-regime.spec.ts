import { settlementRegimeOf } from "../settlement-regime.js";

describe("settlementRegimeOf", () => {
  it("une commande différée et non nulle est au compte", () => {
    expect(settlementRegimeOf("not_required", 1250, null, false)).toBe("account");
  });
  it("une commande à total nul est gratuite, pas au compte", () => {
    expect(settlementRegimeOf("not_required", 0, null, false)).toBe("free");
  });
  it.each(["pending", "failed"] as const)("un règlement %s est dû", (status) => {
    expect(settlementRegimeOf(status, 1250, null, false)).toBe("due");
  });
  it.each(["paid", "refunded"] as const)("un règlement %s a été payé", (status) => {
    expect(settlementRegimeOf(status, 1250, null, false)).toBe("paid");
  });
  it("une commande à régler à la caisse de la boutique n'est pas au compte", () => {
    expect(settlementRegimeOf("not_required", 1250, "shop_till", false)).toBe("shop_till");
  });
  it("🔴 une commande offerte est « offerte », jamais « gratuite » ni au compte", () => {
    expect(settlementRegimeOf("not_required", 0, null, true)).toBe("offered");
  });
  it("le lieu prime, même sur un total nul", () => {
    expect(settlementRegimeOf("not_required", 0, "shop_till", false)).toBe("shop_till");
  });
});
