import { GuestOrderOutsidePublicShopError } from "../../errors/order-buyer-kind-errors.js";
import { asOrderBuyerKind, ensureBuyerKindFits } from "../order-buyer-kind.js";

describe("OrderBuyerKind", () => {
  it("reconnaît les deux portes, et rien d'autre", () => {
    expect(asOrderBuyerKind("guest")).toBe("guest");
    expect(asOrderBuyerKind("registered")).toBe("registered");
    expect(asOrderBuyerKind("Guest")).toBeNull();
    expect(asOrderBuyerKind("")).toBeNull();
  });

  it("admet un invité sans société ni saisie de l'équipe", () => {
    expect(() =>
      ensureBuyerKindFits({ buyerKind: "guest", companyId: null, placedByStaffId: null }),
    ).not.toThrow();
  });

  it("REFUSE un invité qui porterait une société", () => {
    expect(() =>
      ensureBuyerKindFits({ buyerKind: "guest", companyId: "co_1", placedByStaffId: null }),
    ).toThrow(GuestOrderOutsidePublicShopError);
  });

  it("REFUSE un invité saisi par l'équipe", () => {
    expect(() =>
      ensureBuyerKindFits({ buyerKind: "guest", companyId: null, placedByStaffId: "staff_1" }),
    ).toThrow(GuestOrderOutsidePublicShopError);
  });

  it("admet un inscrit sous toutes les formes", () => {
    expect(() =>
      ensureBuyerKindFits({
        buyerKind: "registered",
        companyId: "co_1",
        placedByStaffId: "staff_1",
      }),
    ).not.toThrow();
    expect(() =>
      ensureBuyerKindFits({ buyerKind: "registered", companyId: null, placedByStaffId: null }),
    ).not.toThrow();
  });
});
