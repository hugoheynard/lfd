import { countsAsRevenue, type RevenueScopeFacts } from "../sales-revenue-scope.js";

/** Une commande au compte, passée et réglée : le témoin qui compte. */
const COUNTED: RevenueScopeFacts = {
  status: "placed",
  paymentStatus: "not_required",
  settlementVenue: null,
  offered: false,
};

describe("countsAsRevenue — le périmètre du CA partagé avec le cockpit", () => {
  it.each(["placed", "confirmed", "in_production", "ready", "partially_handed_over", "fulfilled"])(
    "compte une commande « %s »",
    (status) => {
      expect(countsAsRevenue({ ...COUNTED, status })).toBe(true);
    },
  );

  it.each(["cancelled", "no_show", "draft"])("ne compte pas une commande « %s »", (status) => {
    expect(countsAsRevenue({ ...COUNTED, status })).toBe(false);
  });

  it("compte une carte encaissée", () => {
    expect(countsAsRevenue({ ...COUNTED, paymentStatus: "paid" })).toBe(true);
  });

  it.each(["pending", "failed", "refunded"])("ne compte pas un règlement « %s »", (payment) => {
    expect(countsAsRevenue({ ...COUNTED, paymentStatus: payment })).toBe(false);
  });

  it("ne compte pas une commande à régler à la caisse de la boutique", () => {
    expect(countsAsRevenue({ ...COUNTED, settlementVenue: "shop_till" })).toBe(false);
  });

  it("ne compte pas une commande offerte, même réglée", () => {
    expect(countsAsRevenue({ ...COUNTED, offered: true })).toBe(false);
  });
});
