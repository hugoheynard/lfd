import {
  BillingFollowAcrossInHouseError,
  InHousePayerBecomesPublicError,
} from "../../errors/in-house-payer-errors.js";
import {
  ensureBillingFollowKeepsInHouse,
  ensureInHouseStaysPrivate,
} from "../in-house-billing-follow.js";

describe("ensureBillingFollowKeepsInHouse — un suivi `billing` entre deux natures maison", () => {
  it("refuse un site non maison qui suivrait la facturation d'un principal maison", () => {
    expect(() =>
      ensureBillingFollowKeepsInHouse({
        aspect: "billing",
        parentId: "groupe",
        childInHouse: false,
        parentInHouse: true,
      }),
    ).toThrow(BillingFollowAcrossInHouseError);
  });

  it("admet deux comptes de même nature", () => {
    expect(() =>
      ensureBillingFollowKeepsInHouse({
        aspect: "billing",
        parentId: "groupe",
        childInHouse: true,
        parentInHouse: true,
      }),
    ).not.toThrow();
  });

  it("laisse passer un autre aspect, qui ne dit rien du règlement", () => {
    expect(() =>
      ensureBillingFollowKeepsInHouse({
        aspect: "pricing",
        parentId: "groupe",
        childInHouse: false,
        parentInHouse: true,
      }),
    ).not.toThrow();
  });
});

describe("ensureInHouseStaysPrivate — un restaurant maison n'est pas un organisme public", () => {
  it("refuse une forme publique sur un payeur maison", () => {
    expect(() =>
      ensureInHouseStaysPrivate({ companyId: "resto", inHouse: true, isPublicAfter: true }),
    ).toThrow(InHousePayerBecomesPublicError);
  });

  it("admet une forme publique hors maison", () => {
    expect(() =>
      ensureInHouseStaysPrivate({ companyId: "mairie", inHouse: false, isPublicAfter: true }),
    ).not.toThrow();
  });
});
