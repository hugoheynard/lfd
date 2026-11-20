import { settlementRegimeOf } from "../settlement-regime.js";

describe("settlementRegimeOf", () => {
  it("une commande différée et non nulle est au compte", () => {
    expect(settlementRegimeOf("not_required", 1250, null)).toBe("account");
  });
  it("une commande à total nul est gratuite, pas au compte", () => {
    expect(settlementRegimeOf("not_required", 0, null)).toBe("free");
  });
  it.each(["pending", "failed"] as const)("un règlement %s est dû", (status) => {
    expect(settlementRegimeOf(status, 1250, null)).toBe("due");
  });
  it.each(["paid", "refunded"] as const)("un règlement %s a été payé", (status) => {
    expect(settlementRegimeOf(status, 1250, null)).toBe("paid");
  });
  it("une commande à régler à la caisse de la boutique n'est pas au compte", () => {
    expect(settlementRegimeOf("not_required", 1250, "shop_till")).toBe("shop_till");
  });
  it("le lieu prime, même sur un total nul", () => {
    expect(settlementRegimeOf("not_required", 0, "shop_till")).toBe("shop_till");
  });
});
